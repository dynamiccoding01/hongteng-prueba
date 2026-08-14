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
let varianteClpId: number;
let ventaClpId: number;
/**
 * El tipo de cambio no lo elige el test: desde la migración 0025 lo pone
 * `fn_documento_tipo_cambio` con el oficial de la fecha, y mandarle uno en el
 * insert no sirve de nada. Se lee el que le tocó al documento y las cuentas se
 * hacen con ese, que es justo lo que se quiere comprobar de las vistas.
 */
let tipoCambio: number;

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
      `insert into categoria (codigo, nombre_es, unidad_medida_default_id)
       values ('${CODIGO}', 'Cat test', (select id from unidad_medida where codigo = 'PAR')) returning id`,
    );
    categoriaId = n(cat, 'id');
    const [prod] = await consultar(
      `insert into producto (codigo, categoria_id, unidad_medida_id)
       values ('${CODIGO}', ${categoriaId}, (select id from unidad_medida where codigo = 'PAR')) returning id`,
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

    // Importación confirmada: 5 cajas a 20 USD (costo para REP-04).
    const [imp] = await consultar(
      `insert into importacion (proveedor_id, moneda_id)
       values (${proveedorId}, ${monedaId}) returning id, tipo_cambio`,
    );
    importacionId = n(imp, 'id');
    tipoCambio = n(imp, 'tipo_cambio');
    await consultar(
      `insert into importacion_detalle (importacion_id, variante_id, zona_id, cajas, costo_caja)
       values (${importacionId}, ${varianteId}, ${zonaId}, 5, 20)`,
    );
    await comoAdmin(`select fn_confirmar_importacion(${importacionId})`);

    // Venta confirmada: 4 cajas a 35 USD (REP-02 y REP-05). Quedan 1 < mínimo 3.
    const [ven] = await consultar(
      `insert into venta (cliente_id, moneda_id)
       values (${clienteId}, ${monedaId}) returning id`,
    );
    ventaId = n(ven, 'id');
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 4, 35)`,
    );
    await comoAdmin(`select fn_confirmar_venta(${ventaId})`);

    // Segunda venta, en PESOS y sobre otro empaque para no mover el stock ni
    // el costo del anterior. Existe para vigilar el error que corrigio 0025:
    // el precio ya esta en pesos y no se debe volver a multiplicar por el
    // tipo de cambio, que ahora toda venta lleva.
    // Otras unidades por caja: `producto_variante_uk` no admite dos empaques
    // iguales del mismo producto.
    const [vari2] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja)
       values (${productoId}, 6) returning id`,
    );
    varianteClpId = n(vari2, 'id');
    await consultar(
      `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteClpId}, ${zonaId}, 'ENTRADA', 3)`,
    );
    const [clp] = await consultar(`select id from moneda where codigo = 'CLP'`);
    const [venClp] = await consultar(
      `insert into venta (cliente_id, moneda_id)
       values (${clienteId}, ${n(clp, 'id')}) returning id`,
    );
    ventaClpId = n(venClp, 'id');
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaClpId}, ${varianteClpId}, ${zonaId}, 2, 12000)`,
    );
    await comoAdmin(`select fn_confirmar_venta(${ventaClpId})`);
  }, 120_000);

  afterAll(async () => {
    if (!varianteId) return;
    // Si el montaje se cortó a la mitad, los ids de lo último que crea pueden
    // no existir. El 0 no coincide con ninguna fila y deja pasar la limpieza
    // del resto, que es justo lo que hay que borrar en ese caso.
    varianteClpId ??= 0;
    ventaClpId ??= 0;
    await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle disable trigger tr_detalle_solo_borrador;
      alter table importacion disable trigger tr_importacion_confirmada_inmutable;
      alter table venta_detalle disable trigger tr_venta_detalle_solo_borrador;
      alter table venta disable trigger tr_venta_confirmada_inmutable;
      delete from movimiento where variante_id in (${varianteId}, ${varianteClpId});
      delete from stock where variante_id in (${varianteId}, ${varianteClpId});
      delete from importacion_detalle where importacion_id = ${importacionId};
      delete from importacion where id = ${importacionId};
      delete from venta_detalle where venta_id in (${ventaId}, ${ventaClpId});
      delete from venta where id in (${ventaId}, ${ventaClpId});
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      alter table importacion_detalle enable trigger tr_detalle_solo_borrador;
      alter table importacion enable trigger tr_importacion_confirmada_inmutable;
      alter table venta_detalle enable trigger tr_venta_detalle_solo_borrador;
      alter table venta enable trigger tr_venta_confirmada_inmutable;
      delete from cliente where id = ${clienteId};
      delete from proveedor where id = ${proveedorId};
      delete from producto_variante where id in (${varianteId}, ${varianteClpId});
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
      `select cantidad, costo_caja, tipo_cambio, valor_clp from v_valorizacion
        where variante_id = ${varianteId}`,
    );
    // Quedó 1 caja × 20 USD, convertida con el tipo de cambio del documento.
    expect(n(fila, 'cantidad')).toBe(1);
    expect(n(fila, 'costo_caja')).toBe(20);
    expect(n(fila, 'tipo_cambio')).toBe(tipoCambio);
    expect(n(fila, 'valor_clp')).toBe(Math.round(1 * 20 * tipoCambio));
  });

  it('v_ventas_detalle expone la línea con su monto en CLP (REP-05)', async () => {
    const [fila] = await consultar(
      `select cajas, precio_caja, monto_clp, cliente_codigo from v_ventas_detalle
        where venta_id = ${ventaId}`,
    );
    // 4 cajas × 35 USD, convertidas con el tipo de cambio de la venta. La
    // venta es en dólares: sin la corrección de 0025 esto daba 140 pesos.
    expect(n(fila, 'cajas')).toBe(4);
    expect(n(fila, 'monto_clp')).toBe(Math.round(4 * 35 * tipoCambio));
    expect(fila?.cliente_codigo).toBe(CODIGO);
  });

  it('v_ventas_detalle no vuelve a convertir una venta que ya está en pesos', async () => {
    const [fila] = await consultar(
      `select moneda, tipo_cambio, monto_clp from v_ventas_detalle
        where venta_id = ${ventaClpId}`,
    );
    // 2 cajas × 12.000 CLP = 24.000, no 24.000 × el tipo de cambio. La venta
    // lleva tipo de cambio igual —lo lleva toda venta— y ahí estaba la trampa:
    // el `coalesce(tipo_cambio, 1)` de antes lo habría multiplicado por 947.
    expect(fila?.moneda).toBe('CLP');
    expect(n(fila, 'tipo_cambio')).toBeGreaterThan(0);
    expect(n(fila, 'monto_clp')).toBe(24000);
  });

  it('v_alertas_stock alerta cuando el stock queda en o bajo el mínimo (INV-05)', async () => {
    const [fila] = await consultar(
      `select cantidad, stock_minimo from v_alertas_stock where variante_id = ${varianteId}`,
    );
    // Stock 1 ≤ mínimo 3: debe aparecer.
    expect(fila).toBeDefined();
    expect(n(fila, 'cantidad')).toBe(1);
    expect(n(fila, 'stock_minimo')).toBe(3);
  });
});

describe.runIf(!hayCredenciales)('reportes (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
