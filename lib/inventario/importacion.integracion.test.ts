/**
 * Tests de integración de compras (COM-01 a COM-03) contra la base real.
 *
 * fn_confirmar_importacion exige permiso, y el permiso depende de auth.uid():
 * para probar el camino feliz se fija request.jwt.claims con el uuid de un
 * administrador real EN LA MISMA sesión de la consulta.
 *
 * Se omiten si no hay .env.local (por ejemplo en CI).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTIMP-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let proveedorId: number;
let monedaId: number;
let adminId: string;
let importacionId: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

/** Ejecuta SQL con auth.uid() = administrador (misma sesión). */
async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

describe.runIf(hayCredenciales)('compras: confirmación de importación', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    ({ consultar } = await import('../../scripts/api-supabase'));

    const [admin] = await consultar(
      `select u.id from usuario u join rol r on r.id = u.rol_id
        where r.nombre = 'Administrador' and u.activo limit 1`,
    );
    if (!admin) throw new Error('No hay un usuario Administrador activo para probar');
    adminId = String(admin.id);

    const [cat] = await consultar(
      `insert into categoria (codigo, nombre_es) values ('${CODIGO}', 'Cat test') returning id`,
    );
    categoriaId = n(cat, 'id');
    const [prod] = await consultar(
      `insert into producto (codigo, categoria_id) values ('${CODIGO}', ${categoriaId}) returning id`,
    );
    productoId = n(prod, 'id');
    const [vari] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja) values (${productoId}, 10) returning id`,
    );
    varianteId = n(vari, 'id');
    const [bod] = await consultar(
      `insert into bodega (codigo, nombre) values ('${CODIGO}', 'Bodega test') returning id`,
    );
    bodegaId = n(bod, 'id');
    const [zon] = await consultar(
      `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}') returning id`,
    );
    zonaId = n(zon, 'id');
    const [prov] = await consultar(
      `insert into proveedor (codigo, nombre) values ('${CODIGO}', 'Proveedor test') returning id`,
    );
    proveedorId = n(prov, 'id');
    const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
    monedaId = n(mon, 'id');

    const [imp] = await consultar(
      `insert into importacion (proveedor_id, moneda_id, tipo_cambio, documento_aduana)
       values (${proveedorId}, ${monedaId}, 950.5, '203-TEST') returning id`,
    );
    importacionId = n(imp, 'id');

    await consultar(
      `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas, costo_caja)
       values (${importacionId}, ${varianteId}, ${zonaId}, 4, 25)`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!varianteId) return;
    await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle disable trigger tr_detalle_solo_borrador;
      alter table importacion disable trigger tr_importacion_confirmada_inmutable;
      delete from movimiento where variante_id = ${varianteId};
      delete from stock where variante_id = ${varianteId};
      delete from importacion_detalle where importacion_id = ${importacionId};
      delete from importacion where id = ${importacionId};
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle enable trigger tr_detalle_solo_borrador;
      alter table importacion enable trigger tr_importacion_confirmada_inmutable;
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id = ${zonaId};
      delete from bodega where id = ${bodegaId};
      delete from proveedor where id = ${proveedorId};
      delete from categoria where id = ${categoriaId};
    `);
  }, 60_000);

  it('sin usuario autenticado la confirmación se rechaza', async () => {
    await expect(consultar(`select fn_confirmar_importacion(${importacionId})`)).rejects.toThrow(
      /permiso/,
    );
  });

  it('al confirmar como administrador entra el stock y se sella la importación', async () => {
    await comoAdmin(`select fn_confirmar_importacion(${importacionId})`);

    const [imp] = await consultar(
      `select estado, confirmada_en from importacion where id = ${importacionId}`,
    );
    expect(imp?.estado).toBe('CONFIRMADA');
    expect(imp?.confirmada_en).not.toBeNull();

    // 4 cajas × 10 u/caja: el trigger del movimiento hizo la conversión.
    const [stock] = await consultar(
      `select cajas, unidades from stock where variante_id = ${varianteId} and zona_id = ${zonaId}`,
    );
    expect(n(stock, 'cajas')).toBe(4);
    expect(n(stock, 'unidades')).toBe(40);

    const [mov] = await consultar(
      `select count(*)::int as total from movimiento
        where documento_tipo = 'IMPORTACION' and documento_id = ${importacionId}`,
    );
    expect(n(mov, 'total')).toBe(1);
  });

  it('no se puede confirmar dos veces', async () => {
    await expect(comoAdmin(`select fn_confirmar_importacion(${importacionId})`)).rejects.toThrow(
      /ya esta confirmada/,
    );
  });

  it('el detalle de una importación confirmada no se modifica', async () => {
    await expect(
      consultar(
        `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas)
         values (${importacionId}, ${varianteId}, ${zonaId}, 1)`,
      ),
    ).rejects.toThrow(/no se modifica/);
  });

  it('la cabecera confirmada tampoco se edita', async () => {
    await expect(
      consultar(`update importacion set notas = 'x' where id = ${importacionId}`),
    ).rejects.toThrow(/no se edita/);
  });
});

describe.runIf(!hayCredenciales)('compras (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
