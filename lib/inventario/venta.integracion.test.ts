/**
 * Tests de integración de ventas (VEN-01/02/04) contra la base real.
 * Mismo mecanismo que compras: auth.uid() se fija vía request.jwt.claims.
 * Se omiten si no hay .env.local (por ejemplo en CI).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTVEN-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let clienteId: number;
let listaId: number;
let monedaId: number;
let adminId: string;
let ventaId: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

describe.runIf(hayCredenciales)('ventas: confirmación y precios', { timeout: 60_000 }, () => {
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
    const [vari] = await consultar(
      `insert into producto_variante (producto_id, unidades_por_caja) values (${productoId}, 6) returning id`,
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
    const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
    monedaId = n(mon, 'id');

    // Lista de precios con el artículo a 30 USD la caja, asignada al cliente.
    const [lista] = await consultar(
      `insert into lista_precio (nombre, moneda_id) values ('${CODIGO}', ${monedaId}) returning id`,
    );
    listaId = n(lista, 'id');
    await consultar(
      `insert into lista_precio_item (lista_id, variante_id, precio_caja)
       values (${listaId}, ${varianteId}, 30)`,
    );
    const [cli] = await consultar(
      `insert into cliente (codigo, nombre, lista_precio_id)
       values ('${CODIGO}', 'Cliente test', ${listaId}) returning id`,
    );
    clienteId = n(cli, 'id');

    // Stock inicial: 5 cajas.
    await consultar(
      `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 5)`,
    );

    const [venta] = await consultar(
      `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
    );
    ventaId = n(venta, 'id');
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 2, 30)`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!varianteId) return;
    await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      alter table venta_detalle disable trigger tr_venta_detalle_solo_borrador;
      alter table venta disable trigger tr_venta_confirmada_inmutable;
      delete from movimiento where variante_id = ${varianteId};
      delete from stock where variante_id = ${varianteId};
      delete from venta_detalle where venta_id = ${ventaId};
      delete from venta where id = ${ventaId};
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      alter table venta_detalle enable trigger tr_venta_detalle_solo_borrador;
      alter table venta enable trigger tr_venta_confirmada_inmutable;
      delete from cliente where id = ${clienteId};
      delete from lista_precio_item where lista_id = ${listaId};
      delete from lista_precio where id = ${listaId};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id = ${zonaId};
      delete from bodega where id = ${bodegaId};
      delete from categoria where id = ${categoriaId};
    `);
  }, 60_000);

  it('sin usuario autenticado la confirmación se rechaza', async () => {
    await expect(consultar(`select fn_confirmar_venta(${ventaId})`)).rejects.toThrow(/permiso/);
  });

  it('al confirmar se descuenta el stock y se sella la venta', async () => {
    await comoAdmin(`select fn_confirmar_venta(${ventaId})`);

    const [venta] = await consultar(`select estado from venta where id = ${ventaId}`);
    expect(venta?.estado).toBe('CONFIRMADA');

    // 5 iniciales − 2 vendidas = 3 cajas (18 unidades con factor 6).
    const [stock] = await consultar(
      `select cantidad, total_unidades from stock where variante_id = ${varianteId} and zona_id = ${zonaId}`,
    );
    expect(n(stock, 'cantidad')).toBe(3);
    expect(n(stock, 'total_unidades')).toBe(18);

    const [mov] = await consultar(
      `select count(*)::int as total from movimiento
        where documento_tipo = 'VENTA' and documento_id = ${ventaId} and tipo = 'SALIDA'`,
    );
    expect(n(mov, 'total')).toBe(1);
  });

  it('no se puede confirmar dos veces', async () => {
    await expect(comoAdmin(`select fn_confirmar_venta(${ventaId})`)).rejects.toThrow(
      /ya esta confirmada/,
    );
  });

  it('una venta que sobregira el stock falla completa y no descuenta nada', async () => {
    const [otra] = await consultar(
      `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
    );
    const otraId = n(otra, 'id');
    await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas)
       values (${otraId}, ${varianteId}, ${zonaId}, 1), (${otraId}, ${varianteId}, ${zonaId}, 100)`,
    );

    await expect(comoAdmin(`select fn_confirmar_venta(${otraId})`)).rejects.toThrow(
      /stock_cantidad_check/,
    );

    // Todo o nada: ni siquiera la línea de 1 caja se descontó.
    const [stock] = await consultar(
      `select cantidad from stock where variante_id = ${varianteId} and zona_id = ${zonaId}`,
    );
    expect(n(stock, 'cantidad')).toBe(3);
    const [venta] = await consultar(`select estado from venta where id = ${otraId}`);
    expect(venta?.estado).toBe('BORRADOR');

    await consultar(`
      delete from venta_detalle where venta_id = ${otraId};
      delete from venta where id = ${otraId};
    `);
  });

  it('VEN-07: el subtotal sale de la base y el descuento tiene límites', async () => {
    // Venta propia, sin confirmar: así estas comprobaciones no dependen del
    // orden en que corran los demás tests de este archivo.
    const [propia] = await consultar(
      `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
    );
    const propiaId = n(propia, 'id');

    // 2 cajas a 30 = 60, sin rebajar.
    const [sinRebaja] = await consultar(
      `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${propiaId}, ${varianteId}, ${zonaId}, 2, 30) returning id, descuento, subtotal`,
    );
    expect(n(sinRebaja, 'descuento')).toBe(0);
    expect(n(sinRebaja, 'subtotal')).toBe(60);

    // «Déjemelo en 55»: se guarda la rebaja y el subtotal se recalcula solo.
    const [rebajada] = await consultar(
      `update venta_detalle set descuento = 5 where id = ${n(sinRebaja, 'id')}
       returning descuento, subtotal`,
    );
    expect(n(rebajada, 'descuento')).toBe(5);
    expect(n(rebajada, 'subtotal')).toBe(55);

    // Rebajar más que el importe dejaría la línea en negativo.
    await expect(
      consultar(`update venta_detalle set descuento = 61 where id = ${n(sinRebaja, 'id')}`),
    ).rejects.toThrow(/descuento_ck/);

    // Un descuento negativo sería un recargo encubierto.
    await expect(
      consultar(`update venta_detalle set descuento = -1 where id = ${n(sinRebaja, 'id')}`),
    ).rejects.toThrow(/descuento_ck/);

    // Sin precio no hay nada que rebajar.
    await expect(
      consultar(
        `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, descuento)
         values (${propiaId}, ${varianteId}, ${zonaId}, 1, 5)`,
      ),
    ).rejects.toThrow(/descuento_ck/);

    // El subtotal es generado: no se escribe ni se puede falsear.
    await expect(
      consultar(`update venta_detalle set subtotal = 1 where id = ${n(sinRebaja, 'id')}`),
    ).rejects.toThrow(/generated column|columna generada/i);

    await consultar(`
      delete from venta_detalle where venta_id = ${propiaId};
      delete from venta where id = ${propiaId};
    `);
  });

  it('el detalle de una venta confirmada no se modifica', async () => {
    await expect(
      consultar(
        `insert into venta_detalle (venta_id, variante_id, zona_id, cajas)
         values (${ventaId}, ${varianteId}, ${zonaId}, 1)`,
      ),
    ).rejects.toThrow(/no se modifica/);
  });
});

describe.runIf(!hayCredenciales)('ventas (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
