/**
 * Tests de integración de comisiones (VEN-05) contra la base real.
 * Se omiten si no hay .env.local (por ejemplo en CI).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTCOM-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let clienteId: number;
let monedaId: number;
let adminId: string;
let vendedorId: number;
let ventaId: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

describe.runIf(hayCredenciales)(
  'comisiones: calculo al confirmar (VEN-05)',
  { timeout: 60_000 },
  () => {
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
        `insert into producto_variante (producto_id, unidades_por_caja) values (${productoId}, 5) returning id`,
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
      const [cli] = await consultar(
        `insert into cliente (codigo, nombre) values ('${CODIGO}', 'Cli test') returning id`,
      );
      clienteId = n(cli, 'id');
      const [mon] = await consultar(`select id from moneda where codigo = 'CLP'`);
      monedaId = n(mon, 'id');

      // El admin ya existe como usuario; se lo usa como vendedor de prueba con 10%.
      const [ven] = await consultar(
        `insert into vendedor (usuario_id, porcentaje_comision) values ('${adminId}', 10) returning id`,
      );
      vendedorId = n(ven, 'id');

      await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 10)`,
      );

      // Venta en CLP (tipo_cambio null -> factor 1): 4 cajas x 1000 = 4000 CLP.
      const [venta] = await consultar(
        `insert into venta (cliente_id, moneda_id, vendedor_id) values (${clienteId}, ${monedaId}, ${vendedorId}) returning id`,
      );
      ventaId = n(venta, 'id');
      await consultar(
        `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 4, 1000)`,
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
      delete from vendedor where id = ${vendedorId};
      delete from cliente where id = ${clienteId};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id = ${zonaId};
      delete from bodega where id = ${bodegaId};
      delete from categoria where id = ${categoriaId};
    `);
    }, 60_000);

    it('al confirmar una venta con vendedor, se congela el % y se calcula la comisión', async () => {
      await comoAdmin(`select fn_confirmar_venta(${ventaId})`);

      const [venta] = await consultar(
        `select comision_porcentaje, comision_clp from venta where id = ${ventaId}`,
      );
      // 4 cajas x 1000 CLP = 4000; 10% = 400.
      expect(n(venta, 'comision_porcentaje')).toBe(10);
      expect(n(venta, 'comision_clp')).toBe(400);
    });

    it('la venta aparece en v_comisiones con el vendedor resuelto', async () => {
      const [fila] = await consultar(
        `select vendedor_id, comision_clp from v_comisiones where venta_id = ${ventaId}`,
      );
      expect(fila).toBeDefined();
      expect(n(fila, 'vendedor_id')).toBe(vendedorId);
      expect(n(fila, 'comision_clp')).toBe(400);
    });

    it('un cambio posterior del % del vendedor no altera una comisión ya congelada', async () => {
      await consultar(`update vendedor set porcentaje_comision = 50 where id = ${vendedorId}`);

      const [venta] = await consultar(`select comision_clp from venta where id = ${ventaId}`);
      expect(n(venta, 'comision_clp')).toBe(400);
    });
  },
);

describe.runIf(!hayCredenciales)('comisiones (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
