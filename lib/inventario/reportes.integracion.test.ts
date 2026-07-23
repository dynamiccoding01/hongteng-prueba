/**
 * Tests de integración de las vistas de reportes (REP-02/04/05, INV-05).
 * Se omiten si no hay .env.local (por ejemplo en CI).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTREP-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let proveedorId: number;
let clienteId: number;
let monedaId: number;
let adminId: string;
let importacionId: number;
let ventaId: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

describe.runIf(hayCredenciales)('reportes: vistas de consulta', { timeout: 60_000 }, () => {
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
    // stock_minimo 3 para probar la alerta (INV-05).
    const [vari] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja, stock_minimo)
       values (${productoId}, 10, 3) returning id`,
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
      `insert into proveedor (codigo, nombre) values ('${CODIGO}', 'Prov test') returning id`,
    );
    proveedorId = n(prov, 'id');
    const [cli] = await consultar(
      `insert into cliente (codigo, nombre) values ('${CODIGO}', 'Cli test') returning id`,
    );
    clienteId = n(cli, 'id');
    const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
    monedaId = n(mon, 'id');

    // Importación confirmada: 5 cajas a 20 USD, TC 900 (costo para REP-04).
    const [imp] = await consultar(
      `insert into importacion (proveedor_id, moneda_id, tipo_cambio)
       values (${proveedorId}, ${monedaId}, 900) returning id`,
    );
    importacionId = n(imp, 'id');
    await consultar(
      `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas, costo_caja)
       values (${importacionId}, ${varianteId}, ${zonaId}, 5, 20)`,
    );
    await comoAdmin(`select fn_confirmar_importacion(${importacionId})`);

    // Venta confirmada: 4 cajas a 35 USD (REP-02 y REP-05). Quedan 1 < mínimo 3.
    const [ven] = await consultar(
      `insert into venta (cliente_id, moneda_id, tipo_cambio)
       values (${clienteId}, ${monedaId}, 900) returning id`,
    );
    ventaId = n(ven, 'id');
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 4, 35)`,
    );
    await comoAdmin(`select fn_confirmar_venta(${ventaId})`);
  }, 120_000);

  afterAll(async () => {
    if (!varianteId) return;
    await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle disable trigger tr_detalle_solo_borrador;
      alter table importacion disable trigger tr_importacion_confirmada_inmutable;
      alter table venta_detalle disable trigger tr_venta_detalle_solo_borrador;
      alter table venta disable trigger tr_venta_confirmada_inmutable;
      delete from movimiento where variante_id = ${varianteId};
      delete from stock where variante_id = ${varianteId};
      delete from importacion_detalle where importacion_id = ${importacionId};
      delete from importacion where id = ${importacionId};
      delete from venta_detalle where venta_id = ${ventaId};
      delete from venta where id = ${ventaId};
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle enable trigger tr_detalle_solo_borrador;
      alter table importacion enable trigger tr_importacion_confirmada_inmutable;
      alter table venta_detalle enable trigger tr_venta_detalle_solo_borrador;
      alter table venta enable trigger tr_venta_confirmada_inmutable;
      delete from cliente where id = ${clienteId};
      delete from proveedor where id = ${proveedorId};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id = ${zonaId};
      delete from bodega where id = ${bodegaId};
      delete from categoria where id = ${categoriaId};
    `);
  }, 60_000);

  it('v_salidas_mensuales registra la venta del mes (REP-02)', async () => {
    const [fila] = await consultar(
      `select cajas, unidades from v_salidas_mensuales
        where variante_id = ${varianteId} and mes = date_trunc('month', current_date)::date`,
    );
    expect(n(fila, 'cajas')).toBe(4);
    expect(n(fila, 'unidades')).toBe(40);
  });

  it('v_valorizacion usa el último costo y lo convierte a CLP (REP-04)', async () => {
    const [fila] = await consultar(
      `select cajas, costo_caja, tipo_cambio, valor_clp from v_valorizacion
        where variante_id = ${varianteId}`,
    );
    // Quedó 1 caja × 20 USD × TC 900 = 18.000 CLP.
    expect(n(fila, 'cajas')).toBe(1);
    expect(n(fila, 'costo_caja')).toBe(20);
    expect(n(fila, 'valor_clp')).toBe(18000);
  });

  it('v_ventas_detalle expone la línea con su monto en CLP (REP-05)', async () => {
    const [fila] = await consultar(
      `select cajas, precio_caja, monto_clp, cliente_codigo from v_ventas_detalle
        where venta_id = ${ventaId}`,
    );
    // 4 cajas × 35 USD × TC 900 = 126.000 CLP.
    expect(n(fila, 'cajas')).toBe(4);
    expect(n(fila, 'monto_clp')).toBe(126000);
    expect(fila?.cliente_codigo).toBe(CODIGO);
  });

  it('v_alertas_stock alerta cuando el stock queda en o bajo el mínimo (INV-05)', async () => {
    const [fila] = await consultar(
      `select cajas, stock_minimo from v_alertas_stock where variante_id = ${varianteId}`,
    );
    // Stock 1 ≤ mínimo 3: debe aparecer.
    expect(fila).toBeDefined();
    expect(n(fila, 'cajas')).toBe(1);
    expect(n(fila, 'stock_minimo')).toBe(3);
  });
});

describe.runIf(!hayCredenciales)('reportes (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
