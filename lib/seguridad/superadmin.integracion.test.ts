/**
 * Tests de integración del rol Superadmin y la jerarquía de roles (0013) contra
 * la base real. Se omiten si no hay .env.local (por ejemplo en CI).
 *
 * Lo importante que se verifica aquí es de SEGURIDAD: que la jerarquía se aplica
 * en RLS y un Administrador no puede ver, tocar ni asignarse el rol Superadmin
 * —ni siquiera conociendo su id—. Por eso cada consulta se ejecuta cambiando al
 * rol `authenticated` (si corriéramos como el rol de servicio, RLS se saltaría y
 * no probaríamos nada).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUF = Date.now().toString(36);
let adminId: string;
let superId: string;
let superRolId: number;
let totalPermisos: number;

const n = (fila: Fila | undefined, campo = 'n'): number => Number(fila?.[campo]);

/** Ejecuta SQL como un usuario autenticado concreto, con RLS activo. */
async function como(uid: string, sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false);
     select set_config('role', 'authenticated', false);
     ${sql}`,
  );
}

/** Crea un usuario de Auth (el trigger le crea el perfil) y le fija el rol. */
async function crearUsuario(rol: string): Promise<string> {
  const email = `__seg_${rol}_${SUF}@test.local`;
  const [u] = await consultar(
    `insert into auth.users (id, email, aud, role)
     values (gen_random_uuid(), '${email}', 'authenticated', 'authenticated') returning id`,
  );
  const id = String(u!.id);
  await consultar(
    `update usuario set rol_id=(select id from rol where nombre='${rol}') where id='${id}'`,
  );
  return id;
}

describe.runIf(hayCredenciales)(
  'seguridad: rol Superadmin y jerarquía (0013)',
  { timeout: 60_000 },
  () => {
    beforeAll(async () => {
      ({ consultar } = await import('../../scripts/api-supabase'));
      adminId = await crearUsuario('Administrador');
      superId = await crearUsuario('Superadmin');
      const [r] = await consultar(`select id from rol where nombre='Superadmin'`);
      superRolId = Number(r!.id);
      const [p] = await consultar(`select count(*)::int n from permiso`);
      totalPermisos = n(p);
    }, 60_000);

    afterAll(async () => {
      for (const id of [adminId, superId]) {
        if (!id) continue;
        await consultar(`
          alter table bitacora disable trigger tr_bitacora_sin_delete;
          delete from bitacora where usuario_id='${id}' or registro_id='${id}';
          alter table bitacora enable trigger tr_bitacora_sin_delete;
          delete from auth.users where id='${id}';`);
      }
    }, 60_000);

    it('es_superadmin(): true para el Superadmin, false para el Administrador', async () => {
      const s = await como(superId, `select es_superadmin() as n`);
      const a = await como(adminId, `select es_superadmin() as n`);
      expect(s.at(-1)!.n).toBe(true);
      expect(a.at(-1)!.n).toBe(false);
    });

    it('tiene_permiso(): el Superadmin pasa cualquier código; el Administrador no uno inexistente', async () => {
      const s = await como(superId, `select tiene_permiso('permiso.inventado') as n`);
      const a = await como(adminId, `select tiene_permiso('permiso.inventado') as n`);
      expect(s.at(-1)!.n).toBe(true);
      expect(a.at(-1)!.n).toBe(false);
    });

    it('mis_permisos(): el Superadmin obtiene TODOS los permisos del sistema', async () => {
      const filas = await como(superId, `select count(*)::int n from mis_permisos()`);
      expect(n(filas.at(-1))).toBe(totalPermisos);
    });

    it('RLS rol: el Administrador no ve roles protegidos; el Superadmin sí', async () => {
      const a = await como(adminId, `select count(*)::int n from rol where protegido`);
      const s = await como(superId, `select count(*)::int n from rol where protegido`);
      expect(n(a.at(-1))).toBe(0);
      expect(n(s.at(-1))).toBeGreaterThanOrEqual(1);
    });

    it('RLS usuario: el Administrador no puede escalar asignándose un rol protegido (ni por id literal)', async () => {
      // Puede lanzar error de RLS o afectar 0 filas; en ambos casos el rol no cambia.
      try {
        await como(adminId, `update usuario set rol_id=${superRolId} where id='${adminId}'`);
      } catch {
        // esperado: new row violates row-level security policy
      }
      const [rol] = await consultar(
        `select r.nombre from usuario u join rol r on r.id=u.rol_id where u.id='${adminId}'`,
      );
      expect(rol!.nombre).toBe('Administrador');
    });

    it('RLS usuario: el Administrador no ve a los Superadmin, pero sí se ve a sí mismo', async () => {
      const ve = await como(adminId, `select count(*)::int n from usuario where id='${superId}'`);
      const yo = await como(adminId, `select count(*)::int n from usuario where id='${adminId}'`);
      expect(n(ve.at(-1))).toBe(0);
      expect(n(yo.at(-1))).toBe(1);
    });

    it('RLS rol_permiso: el Administrador no puede añadir permisos a un rol protegido', async () => {
      const [algun] = await consultar(`select id from permiso limit 1`);
      try {
        await como(
          adminId,
          `insert into rol_permiso (rol_id, permiso_id) values (${superRolId}, ${Number(algun!.id)})`,
        );
      } catch {
        // esperado: RLS lo rechaza
      }
      const [c] = await consultar(
        `select count(*)::int n from rol_permiso where rol_id=${superRolId}`,
      );
      expect(n(c)).toBe(0);
    });
  },
);

describe.runIf(!hayCredenciales)('seguridad Superadmin (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
