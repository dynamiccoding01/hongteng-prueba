/**
 * Tests de integración del Sprint 6 (zona franca) contra la base real:
 * correlativo secuencial (ADM-03), traspasos con permiso (INV-07), toma de
 * inventario con ajuste de diferencias (INV-06) y documento de traspaso ante
 * Aduanas (VEN-03). Se omiten si no hay .env.local (por ejemplo en CI).
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TESTZF-${SUFIJO}`;
const TIPO_CORRELATIVO = `TEST_DOC_${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let zonaId2: number;
let clienteId: number;
let monedaId: number;
let adminId: string;
let ventaId: number;
let tomaId: number;
let documentoId: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

async function comoAdmin(sql: string): Promise<Fila[]> {
  return consultar(
    `select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', false); ${sql}`,
  );
}

describe.runIf(hayCredenciales)(
  'zona franca: correlativo, traspasos y toma',
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
        `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}-1') returning id`,
      );
      zonaId = n(zon, 'id');
      const [zon2] = await consultar(
        `insert into zona (bodega_id, codigo) values (${bodegaId}, '${CODIGO}-2') returning id`,
      );
      zonaId2 = n(zon2, 'id');
      const [cli] = await consultar(
        `insert into cliente (codigo, nombre) values ('${CODIGO}', 'Cli test') returning id`,
      );
      clienteId = n(cli, 'id');
      const [mon] = await consultar(`select id from moneda where codigo = 'USD'`);
      monedaId = n(mon, 'id');

      // Stock inicial: 5 cajas en zonaId (para probar traspaso y toma).
      await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 5)`,
      );

      // Venta confirmada, para poder emitir el documento de traspaso (VEN-03).
      const [ven] = await consultar(
        `insert into venta (cliente_id, moneda_id) values (${clienteId}, ${monedaId}) returning id`,
      );
      ventaId = n(ven, 'id');
      await consultar(
        `insert into venta_detalle (venta_id, variante_id, zona_id, cajas, precio_caja)
       values (${ventaId}, ${varianteId}, ${zonaId}, 1, 10)`,
      );
      await comoAdmin(`select fn_confirmar_venta(${ventaId})`);
    }, 120_000);

    afterAll(async () => {
      if (!varianteId) return;
      await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      alter table venta_detalle disable trigger tr_venta_detalle_solo_borrador;
      alter table venta disable trigger tr_venta_confirmada_inmutable;
      alter table toma_inventario_detalle disable trigger tr_toma_detalle_solo_borrador;
      alter table toma_inventario disable trigger tr_toma_aplicada_inmutable;
      alter table documento_traspaso disable trigger tr_documento_traspaso_sin_delete;
      delete from documento_traspaso where venta_id = ${ventaId};
      delete from toma_inventario_detalle where toma_id = ${tomaId};
      delete from toma_inventario where id = ${tomaId};
      delete from movimiento where variante_id = ${varianteId};
      delete from stock where variante_id = ${varianteId};
      delete from venta_detalle where venta_id = ${ventaId};
      delete from venta where id = ${ventaId};
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      alter table venta_detalle enable trigger tr_venta_detalle_solo_borrador;
      alter table venta enable trigger tr_venta_confirmada_inmutable;
      alter table toma_inventario_detalle enable trigger tr_toma_detalle_solo_borrador;
      alter table toma_inventario enable trigger tr_toma_aplicada_inmutable;
      alter table documento_traspaso enable trigger tr_documento_traspaso_sin_delete;
      delete from cliente where id = ${clienteId};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id in (${zonaId}, ${zonaId2});
      delete from bodega where id = ${bodegaId};
      delete from categoria where id = ${categoriaId};
      delete from correlativo where tipo_documento = '${TIPO_CORRELATIVO}';
    `);
    }, 60_000);

    it('fn_siguiente_correlativo entrega folios secuenciales sin repetir', async () => {
      const [f1] = await consultar(
        `select fn_siguiente_correlativo('${TIPO_CORRELATIVO}') as folio`,
      );
      const [f2] = await consultar(
        `select fn_siguiente_correlativo('${TIPO_CORRELATIVO}') as folio`,
      );

      const anio = new Date().getFullYear().toString();
      expect(f1?.folio).toBe(`${anio}00001`);
      expect(f2?.folio).toBe(`${anio}00002`);
    });

    it('fn_traspasar exige permiso (INV-07)', async () => {
      await expect(
        consultar(`select fn_traspasar(${varianteId}, ${zonaId}, ${zonaId2}, 1, 'sin sesion')`),
      ).rejects.toThrow(/permiso/);
    });

    it('fn_traspasar mueve stock cuando el usuario tiene permiso', async () => {
      await comoAdmin(
        `select fn_traspasar(${varianteId}, ${zonaId}, ${zonaId2}, 2, 'test traspaso zona franca')`,
      );

      const [origen] = await consultar(
        `select cajas from stock where variante_id = ${varianteId} and zona_id = ${zonaId}`,
      );
      const [destino] = await consultar(
        `select cajas from stock where variante_id = ${varianteId} and zona_id = ${zonaId2}`,
      );
      // 5 iniciales - 1 vendida - 2 traspasadas = 2 en origen; 2 en destino.
      expect(n(origen, 'cajas')).toBe(2);
      expect(n(destino, 'cajas')).toBe(2);
    });

    it('fn_aplicar_toma_inventario ajusta solo la diferencia (INV-06)', async () => {
      const [toma] = await consultar(
        `insert into toma_inventario (bodega_id) values (${bodegaId}) returning id`,
      );
      tomaId = n(toma, 'id');

      // Sistema tiene 2 en zonaId; se cuenta 5 (sobran 3) y 2 en zonaId2 (cuadra).
      await consultar(`
      insert into toma_inventario_detalle (toma_id, variante_id, zona_id, cajas_contadas)
      values (${tomaId}, ${varianteId}, ${zonaId}, 5),
             (${tomaId}, ${varianteId}, ${zonaId2}, 2)
    `);

      await comoAdmin(`select fn_aplicar_toma_inventario(${tomaId})`);

      const [zona1] = await consultar(
        `select cajas from stock where variante_id = ${varianteId} and zona_id = ${zonaId}`,
      );
      const [zona2] = await consultar(
        `select cajas from stock where variante_id = ${varianteId} and zona_id = ${zonaId2}`,
      );
      expect(n(zona1, 'cajas')).toBe(5);
      expect(n(zona2, 'cajas')).toBe(2);

      // Solo debe haber generado UN ajuste (la zona que cuadraba no genera movimiento).
      const [ajustes] = await consultar(
        `select count(*)::int as total from movimiento
        where documento_tipo = 'INVENTARIO' and documento_id = ${tomaId}`,
      );
      expect(n(ajustes, 'total')).toBe(1);

      const [toma2] = await consultar(`select estado from toma_inventario where id = ${tomaId}`);
      expect(toma2?.estado).toBe('APLICADA');
    });

    it('no se puede aplicar una toma dos veces', async () => {
      await expect(comoAdmin(`select fn_aplicar_toma_inventario(${tomaId})`)).rejects.toThrow(
        /ya fue aplicada/,
      );
    });

    it('fn_emitir_documento_traspaso genera un folio y solo admite una venta CONFIRMADA (VEN-03)', async () => {
      const [doc] = await comoAdmin(
        `select fn_emitir_documento_traspaso(${ventaId}, 'Comprador Test', 'CI-12345', 'La Paz') as id`,
      );
      documentoId = n(doc, 'id');
      expect(documentoId).toBeGreaterThan(0);

      const [fila] = await consultar(
        `select folio, estado, adquiriente_nombre from documento_traspaso where id = ${documentoId}`,
      );
      expect(fila?.estado).toBe('EMITIDO');
      expect(fila?.adquiriente_nombre).toBe('Comprador Test');
      expect(typeof fila?.folio).toBe('string');

      // Una segunda emision para la misma venta se rechaza.
      await expect(
        comoAdmin(`select fn_emitir_documento_traspaso(${ventaId}, 'Otro') as id`),
      ).rejects.toThrow(/ya tiene un documento/);
    });

    it('fn_anular_documento_traspaso sella el documento y no se puede repetir', async () => {
      await comoAdmin(`select fn_anular_documento_traspaso(${documentoId}, 'motivo de prueba')`);

      const [fila] = await consultar(
        `select estado from documento_traspaso where id = ${documentoId}`,
      );
      expect(fila?.estado).toBe('ANULADO');

      await expect(
        comoAdmin(`select fn_anular_documento_traspaso(${documentoId}, 'de nuevo')`),
      ).rejects.toThrow(/ya esta anulado/);
    });

    it('el documento de traspaso anulado no se puede borrar', async () => {
      await expect(
        consultar(`delete from documento_traspaso where id = ${documentoId}`),
      ).rejects.toThrow(/no se borra, se anula/);
    });
  },
);

describe.runIf(!hayCredenciales)('zona franca (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
