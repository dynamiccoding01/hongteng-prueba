/**
 * Guardias de 0036: lo que la base tiene que impedir aunque nadie pase por la
 * aplicación (REVISION_CRITICA.md, G-12 … G-17).
 *
 * Los tests de integración anteriores hablan con la base como `postgres` y
 * solo fijan `request.jwt.claims`: así `tiene_permiso()` sabe quién llama,
 * pero la RLS no se evalúa y los privilegios de rol no cuentan. Por eso los
 * huecos de 0036 no los vio ningún test. Aquí cada consulta corre con
 * `set role authenticated` (o `anon`), que es exactamente lo que hace
 * PostgREST con una petición real.
 *
 * Corre contra el proyecto Supabase real y se omite si no hay `.env.local`.
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTRLS-${SUFIJO}`;

let varianteId: number;
let bodegaId: number;
let zonaId: number;
let zonaId2: number;
let proveedorId: number;
let clienteId: number;
let monedaId: number;
let adminId: string;
/** Operador con lo justo para trabajar, pero sin anular ni ver la bitácora ajena. */
let operadorId: string;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

/**
 * Ejecuta como lo haría PostgREST: con el rol de la API y la sesión indicada.
 * `null` es una petición sin sesión (solo la clave pública).
 */
async function comoApi(uid: string | null, sql: string): Promise<Fila[]> {
  const rol = uid === null ? 'anon' : 'authenticated';
  const claims = uid === null ? '{"role":"anon"}' : `{"sub":"${uid}","role":"authenticated"}`;
  return consultar(
    `select set_config('request.jwt.claims', '${claims}', false); set role ${rol}; ${sql}`,
  );
}

/** Existencia de la variante de prueba en una zona, leída como `postgres`. */
async function existencia(zona: number): Promise<number> {
  const [fila] = await consultar(
    `select coalesce((select cantidad from stock
                       where variante_id = ${varianteId} and zona_id = ${zona}), 0) as cantidad`,
  );
  return n(fila, 'cantidad');
}

describe.runIf(hayCredenciales)('0036: la base se defiende sola', { timeout: 180_000 }, () => {
  beforeAll(async () => {
    ({ consultar } = await import('../../scripts/api-supabase'));

    const [admin] = await consultar(
      `select u.id from usuario u join rol r on r.id = u.rol_id
        where r.nombre = 'Administrador' and u.activo limit 1`,
    );
    if (!admin) throw new Error('No hay un usuario Administrador activo para probar');
    adminId = String(admin.id);

    const [cat] = await consultar(
      `insert into categoria (codigo, nombre_es, unidad_medida_default_id)
       values ('${CODIGO}', 'Cat rls', (select id from unidad_medida where codigo = 'PAR'))
       returning id`,
    );
    const [prod] = await consultar(
      `insert into producto (codigo, categoria_id, unidad_medida_id)
       values ('${CODIGO}', ${n(cat, 'id')}, (select id from unidad_medida where codigo = 'PAR'))
       returning id`,
    );
    const [vari] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja)
       values (${n(prod, 'id')}, 10) returning id`,
    );
    varianteId = n(vari, 'id');
    const [bod] = await consultar(
      `insert into bodega (codigo, nombre) values ('${CODIGO}', 'Bodega rls') returning id`,
    );
    bodegaId = n(bod, 'id');
    const [zon] = await consultar(
      `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}-A') returning id`,
    );
    zonaId = n(zon, 'id');
    const [zon2] = await consultar(
      `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}-B') returning id`,
    );
    zonaId2 = n(zon2, 'id');
    const [prov] = await consultar(
      `insert into proveedor (codigo, nombre) values ('${CODIGO}', 'Prov rls') returning id`,
    );
    proveedorId = n(prov, 'id');
    const [cli] = await consultar(
      `insert into cliente (codigo, nombre) values ('${CODIGO}', 'Cli rls') returning id`,
    );
    clienteId = n(cli, 'id');
    const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
    monedaId = n(mon, 'id');

    await consultar(
      `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 100)`,
    );

    /*
     * El operador puede vender, comprar, contar y registrar movimientos —todo
     * lo que hace falta para intentar los atajos—, pero no tiene
     * `movimiento.anular`, ni `bitacora.ver`, ni `usuario.ver`.
     */
    const [rol] = await consultar(
      `insert into rol (nombre, descripcion) values ('${CODIGO}', 'Operador de prueba') returning id`,
    );
    await consultar(
      `insert into rol_permiso (rol_id, permiso_id)
       select ${n(rol, 'id')}, p.id from permiso p where p.codigo in (
         'producto.ver', 'categoria.ver', 'zona.ver', 'stock.ver',
         'movimiento.ver', 'movimiento.crear',
         'venta.ver', 'venta.crear', 'cliente.ver',
         'importacion.ver', 'importacion.crear', 'proveedor.ver',
         'toma.ver', 'toma.crear'
       )`,
    );
    const [auth] = await consultar(
      `insert into auth.users (id, email, aud, role)
       values (gen_random_uuid(), '${CODIGO.toLowerCase()}@test.local', 'authenticated', 'authenticated')
       returning id`,
    );
    operadorId = String(auth?.['id']);
    await consultar(`update usuario set rol_id = ${n(rol, 'id')} where id = '${operadorId}'`);
  });

  afterAll(async () => {
    // Igual que en regresiones.integracion.test.ts: borrar por prefijo, con los
    // triggers apagados solo para esta sesión.
    await consultar(`
      set session_replication_role = replica;

      delete from movimiento where variante_id in (
        select v.id from producto_variante v join producto p on p.id = v.producto_id
         where p.codigo like '${CODIGO}%');
      delete from stock where variante_id in (
        select v.id from producto_variante v join producto p on p.id = v.producto_id
         where p.codigo like '${CODIGO}%');

      delete from importacion_detalle where importacion_id in (
        select i.id from importacion i join proveedor pr on pr.id = i.proveedor_id
         where pr.codigo like '${CODIGO}%');
      delete from importacion where proveedor_id in (
        select id from proveedor where codigo like '${CODIGO}%');

      delete from venta_detalle where venta_id in (
        select v.id from venta v join cliente c on c.id = v.cliente_id
         where c.codigo like '${CODIGO}%');
      delete from venta where cliente_id in (
        select id from cliente where codigo like '${CODIGO}%');

      delete from toma_inventario_detalle where toma_id in (
        select t.id from toma_inventario t join bodega b on b.id = t.bodega_id
         where b.codigo like '${CODIGO}%');
      delete from toma_inventario where bodega_id in (
        select id from bodega where codigo like '${CODIGO}%');

      delete from correlativo where tipo_documento like '${CODIGO}%';

      delete from cliente where codigo like '${CODIGO}%';
      delete from proveedor where codigo like '${CODIGO}%';
      delete from producto_variante where producto_id in (
        select id from producto where codigo like '${CODIGO}%');
      delete from producto where codigo like '${CODIGO}%';
      delete from zona where bodega_id in (
        select id from bodega where codigo like '${CODIGO}%');
      delete from bodega where codigo like '${CODIGO}%';
      delete from categoria where codigo like '${CODIGO}%';

      delete from usuario where id in (
        select id from auth.users where email like '${CODIGO.toLowerCase()}%');
      delete from auth.users where email like '${CODIGO.toLowerCase()}%';
      delete from rol_permiso where rol_id in (select id from rol where nombre like '${CODIGO}%');
      delete from rol where nombre like '${CODIGO}%';
    `);
  });

  describe('G-12: las vistas respetan la RLS de sus tablas (S-03)', () => {
    it.each(['v_bitacora', 'v_stock_variante', 'v_resumen_categoria'])(
      '%s tiene security_invoker',
      async (vista) => {
        const [fila] = await consultar(
          `select coalesce(array_to_string(c.reloptions, ','), '') as opciones
             from pg_class c join pg_namespace es on es.oid = c.relnamespace
            where es.nspname = 'public' and c.relname = '${vista}'`,
        );
        expect(String(fila?.['opciones'])).toContain('security_invoker=true');
      },
    );

    it('sin bitacora.ver no se ve la actividad de los demás', async () => {
      /*
       * `/bitacora` promete «sin bitacora.ver, solo la propia; lo decide RLS».
       * La vista corría como su dueño y la RLS no decidía nada.
       */
      const [ajena] = await consultar(
        `select count(*) as total from bitacora where usuario_id is distinct from '${operadorId}'`,
      );
      expect(n(ajena, 'total')).toBeGreaterThan(0);

      const [vista] = await comoApi(
        operadorId,
        `select count(*) as total from v_bitacora where usuario_id is distinct from '${operadorId}'`,
      );
      expect(n(vista, 'total')).toBe(0);
    });

    it('sin sesión no se lee ninguna vista', async () => {
      await expect(comoApi(null, `select count(*) from v_bitacora`)).rejects.toThrow(
        /permission denied/i,
      );
      await expect(comoApi(null, `select count(*) from v_stock_variante`)).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  describe('G-13: fn_anular_movimiento tiene su propia puerta (S-04)', () => {
    it('sin movimiento.anular se rechaza y el stock no se mueve', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'SALIDA', 1) returning id`,
      );
      const antes = await existencia(zonaId);

      await expect(
        comoApi(operadorId, `select fn_anular_movimiento(${n(mov, 'id')}, 'atajo')`),
      ).rejects.toThrow(/permiso/i);
      await expect(
        comoApi(null, `select fn_anular_movimiento(${n(mov, 'id')}, 'sin sesion')`),
      ).rejects.toThrow(/permission denied/i);

      expect(await existencia(zonaId)).toBe(antes);
    });

    it('no se anula la mitad de un traspaso', async () => {
      /*
       * Anular la TRASPASO_SALIDA devolvía la mercadería al origen sin
       * quitarla del destino: las cajas quedaban contadas dos veces.
       */
      await comoApi(adminId, `select fn_traspasar(${varianteId}, ${zonaId}, ${zonaId2}, 2)`);
      const [salida] = await consultar(
        `select id from movimiento
          where variante_id = ${varianteId} and tipo = 'TRASPASO_SALIDA'
          order by id desc limit 1`,
      );

      await expect(
        comoApi(adminId, `select fn_anular_movimiento(${n(salida, 'id')}, 'media vuelta')`),
      ).rejects.toThrow(/documento/i);
    });

    it('no se anula una anulación', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'ENTRADA', 1) returning id`,
      );
      const [anulacion] = await comoApi(
        adminId,
        `select fn_anular_movimiento(${n(mov, 'id')}, 'primera') as id`,
      );

      await expect(
        comoApi(adminId, `select fn_anular_movimiento(${n(anulacion, 'id')}, 'deshacer')`),
      ).rejects.toThrow(/anulacion de otro/i);
    });

    it('el motivo es obligatorio también en la base', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'ENTRADA', 1) returning id`,
      );
      await expect(
        comoApi(adminId, `select fn_anular_movimiento(${n(mov, 'id')}, '   ')`),
      ).rejects.toThrow(/motivo/i);
    });
  });

  describe('G-14: el estado de un documento solo lo cambia su función (S-05)', () => {
    it('una venta no se confirma con un UPDATE', async () => {
      const [venta] = await consultar(
        `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
      );
      const id = n(venta, 'id');

      await expect(
        comoApi(operadorId, `update venta set estado = 'CONFIRMADA' where id = ${id}`),
      ).rejects.toThrow(/funcion de confirmacion/i);
      await expect(
        comoApi(operadorId, `update venta set folio = '${CODIGO}' where id = ${id}`),
      ).rejects.toThrow(/funcion de confirmacion/i);

      const [fila] = await consultar(`select estado, folio from venta where id = ${id}`);
      expect(fila?.['estado']).toBe('BORRADOR');
      expect(fila?.['folio']).toBeNull();
    });

    it('una venta no nace confirmada', async () => {
      await expect(
        comoApi(
          operadorId,
          `insert into venta (cliente_id, moneda_id, estado)
           values (${clienteId}, ${monedaId}, 'CONFIRMADA')`,
        ),
      ).rejects.toThrow(/se crea en BORRADOR/i);
    });

    it('una importación no se confirma con un UPDATE', async () => {
      const [imp] = await consultar(
        `insert into importacion (proveedor_id, moneda_id)
         values (${proveedorId}, ${monedaId}) returning id`,
      );
      await expect(
        comoApi(
          operadorId,
          `update importacion set estado = 'CONFIRMADA' where id = ${n(imp, 'id')}`,
        ),
      ).rejects.toThrow(/funcion de confirmacion/i);
    });

    it('una toma no se da por aplicada con un UPDATE', async () => {
      const [toma] = await consultar(
        `insert into toma_inventario (bodega_id) values (${bodegaId}) returning id`,
      );
      await expect(
        comoApi(
          operadorId,
          `update toma_inventario set estado = 'APLICADA' where id = ${n(toma, 'id')}`,
        ),
      ).rejects.toThrow(/funcion de confirmacion/i);
    });

    it('el camino legítimo sigue abierto: la función confirma', async () => {
      /*
       * La prueba de que el trigger distingue bien: la misma persona, con el
       * mismo rol de la API, confirma por la función y el sello se escribe.
       * Se prueba con una importación y no con una venta para no consumir un
       * folio de la serie real del cliente.
       */
      const [imp] = await consultar(
        `insert into importacion (proveedor_id, moneda_id)
         values (${proveedorId}, ${monedaId}) returning id`,
      );
      const id = n(imp, 'id');
      await consultar(
        `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas, costo_caja)
         values (${id}, ${varianteId}, ${zonaId}, 3, 10)`,
      );
      const antes = await existencia(zonaId);

      await expect(
        comoApi(operadorId, `select fn_confirmar_importacion(${id})`),
      ).resolves.toBeDefined();

      const [fila] = await consultar(
        `select estado, confirmada_por from importacion where id = ${id}`,
      );
      expect(fila?.['estado']).toBe('CONFIRMADA');
      expect(String(fila?.['confirmada_por'])).toBe(operadorId);
      expect(await existencia(zonaId)).toBe(antes + 3);
    });

    it('las ediciones normales de un borrador siguen funcionando', async () => {
      const [venta] = await consultar(
        `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
      );
      await expect(
        comoApi(operadorId, `update venta set notas = 'cambio' where id = ${n(venta, 'id')}`),
      ).resolves.toBeDefined();
    });
  });

  describe('G-15: sin sesión no se ejecuta ninguna función (S-07)', () => {
    it('anon no escribe en la bitácora', async () => {
      // Antes quedaba a nombre de «sistema», indistinguible de un proceso real.
      await expect(
        comoApi(null, `select registrar_en_bitacora('LOGIN', 'admin', '${CODIGO}')`),
      ).rejects.toThrow(/permission denied/i);
    });

    it('con sesión sí, y queda a nombre de quien la tiene', async () => {
      const [fila] = await comoApi(
        operadorId,
        `select registrar_en_bitacora('EXPORTAR', 'reportes', '${CODIGO}') as id`,
      );
      const [registro] = await consultar(
        `select usuario_id from bitacora where id = ${n(fila, 'id')}`,
      );
      expect(String(registro?.['usuario_id'])).toBe(operadorId);
    });
  });

  it('G-16: fn_siguiente_correlativo no se llama desde la API (S-07)', async () => {
    /*
     * Cada llamada consumía un número de la serie. Ahora solo la pueden usar
     * las funciones que emiten documentos, que corren como su dueño.
     */
    await expect(
      comoApi(operadorId, `select fn_siguiente_correlativo('${CODIGO}')`),
    ).rejects.toThrow(/permission denied/i);

    const [fila] = await consultar(
      `select count(*) as total from correlativo where tipo_documento = '${CODIGO}'`,
    );
    expect(n(fila, 'total')).toBe(0);
  });

  describe('G-17: lo que se registra a mano en el kardex (S-06)', () => {
    it('medio traspaso no se inserta suelto', async () => {
      await expect(
        comoApi(
          operadorId,
          `insert into movimiento (variante_id, zona_id, tipo, cajas)
           values (${varianteId}, ${zonaId2}, 'TRASPASO_ENTRADA', 50)`,
        ),
      ).rejects.toThrow(/traspaso/i);
    });

    it('la salida de un documento no se inventa', async () => {
      await expect(
        comoApi(
          operadorId,
          `insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id)
           values (${varianteId}, ${zonaId}, 'SALIDA', 1, 'VENTA', 1)`,
        ),
      ).rejects.toThrow(/documento/i);
    });

    it('una anulación no se registra a mano', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'ENTRADA', 1) returning id`,
      );
      await expect(
        comoApi(
          operadorId,
          `insert into movimiento (variante_id, zona_id, tipo, cajas, anulado_por)
           values (${varianteId}, ${zonaId}, 'SALIDA', 1, ${n(mov, 'id')})`,
        ),
      ).rejects.toThrow(/fn_anular_movimiento/i);
    });

    it('un movimiento queda firmado por quien lo inserta, no por quien diga', async () => {
      const [fila] = await comoApi(
        operadorId,
        `insert into movimiento (variante_id, zona_id, tipo, cajas, usuario_id, fecha)
         values (${varianteId}, ${zonaId}, 'ENTRADA', 1, '${adminId}', '2020-01-01')
         returning usuario_id, fecha`,
      );
      expect(String(fila?.['usuario_id'])).toBe(operadorId);
      expect(new Date(String(fila?.['fecha'])).getFullYear()).toBeGreaterThan(2020);
    });
  });
});
