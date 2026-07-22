/**
 * Tests de integración del inventario (Definición de Terminado: si toca stock,
 * se prueba contra la base real, incluida la concurrencia).
 *
 * Corren contra el proyecto Supabase usando la Management API (igual que
 * scripts/aplicar-migraciones.ts), con datos de prueba de código único que se
 * eliminan al terminar. Si no hay .env.local (por ejemplo en CI), se omiten.
 *
 *   npx vitest run lib/inventario
 */

import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hayCredenciales = existsSync('.env.local');

type Fila = Record<string, unknown>;
let consultar: (sql: string) => Promise<Fila[]>;

const SUFIJO = Date.now().toString(36).toUpperCase();
const CODIGO = `TEST-${SUFIJO}`;

let categoriaId: number;
let productoId: number;
let varianteId: number;
let bodegaId: number;
let zonaId: number;
let zonaId2: number;

const n = (fila: Fila | undefined, campo: string): number => Number(fila?.[campo]);

async function stockActual(zona: number): Promise<{ cajas: number; unidades: number }> {
  const filas = await consultar(
    `select cajas, unidades from stock where variante_id = ${varianteId} and zona_id = ${zona}`,
  );
  return { cajas: n(filas[0], 'cajas'), unidades: n(filas[0], 'unidades') };
}

describe.runIf(hayCredenciales)(
  'inventario: movimientos y stock (integración)',
  { timeout: 30_000 },
  () => {
    beforeAll(async () => {
      ({ consultar } = await import('../../scripts/api-supabase'));

      const [cat] = await consultar(
        `insert into categoria (codigo, nombre_es) values ('${CODIGO}', 'Categoría de test') returning id`,
      );
      categoriaId = n(cat, 'id');

      const [prod] = await consultar(
        `insert into producto (codigo, categoria_id, unidad_medida) values ('${CODIGO}', ${categoriaId}, 'PAR') returning id`,
      );
      productoId = n(prod, 'id');

      // Factor 12: cada caja son 12 unidades (INV-04).
      const [vari] = await consultar(
        `insert into producto_variante (producto_id, unidades_por_caja) values (${productoId}, 12) returning id`,
      );
      varianteId = n(vari, 'id');

      const [bod] = await consultar(
        `insert into bodega (codigo, nombre) values ('${CODIGO}', 'Bodega de test') returning id`,
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
    }, 60_000);

    afterAll(async () => {
      if (!varianteId) return;
      // El kardex es append-only por trigger; para limpiar los datos de prueba
      // se levanta la barrera solo durante la limpieza y se restituye al final.
      await consultar(`
      alter table movimiento disable trigger tr_movimiento_sin_delete;
      delete from movimiento where variante_id = ${varianteId};
      alter table movimiento enable trigger tr_movimiento_sin_delete;
      delete from stock where variante_id = ${varianteId};
      delete from producto_variante where id = ${varianteId};
      delete from producto where id = ${productoId};
      delete from zona where id in (${zonaId}, ${zonaId2});
      delete from bodega where id = ${bodegaId};
      delete from categoria where id = ${categoriaId};
    `);
    }, 60_000);

    it('una ENTRADA crea stock y convierte cajas a unidades con el factor del empaque', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'ENTRADA', 5) returning unidades, saldo_cajas`,
      );

      // 5 cajas × 12 u/caja: la conversión la hace el trigger, no la aplicación.
      expect(n(mov, 'unidades')).toBe(60);
      expect(n(mov, 'saldo_cajas')).toBe(5);

      const stock = await stockActual(zonaId);
      expect(stock.cajas).toBe(5);
      expect(stock.unidades).toBe(60);
    });

    it('una SALIDA descuenta y deja el saldo en el kardex', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId}, 'SALIDA', 2) returning saldo_cajas`,
      );

      expect(n(mov, 'saldo_cajas')).toBe(3);
      expect((await stockActual(zonaId)).cajas).toBe(3);
    });

    it('rechaza un sobregiro: no existe el stock negativo', async () => {
      await expect(
        consultar(
          `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'SALIDA', 100)`,
        ),
      ).rejects.toThrow(/stock_cajas_check/);

      expect((await stockActual(zonaId)).cajas).toBe(3);
    });

    it('el kardex es append-only: UPDATE y DELETE fallan', async () => {
      await expect(
        consultar(`update movimiento set cajas = 999 where variante_id = ${varianteId}`),
      ).rejects.toThrow(/append-only/);
      await expect(
        consultar(`delete from movimiento where variante_id = ${varianteId}`),
      ).rejects.toThrow(/append-only/);
    });

    it('concurrencia: dos salidas simultáneas no sobregiran (gana exactamente una)', async () => {
      // Stock actual: 3. Dos salidas de 2 en paralelo: solo una puede pasar.
      const salida = () =>
        consultar(
          `insert into movimiento (variante_id, zona_id, tipo, cajas)
         values (${varianteId}, ${zonaId}, 'SALIDA', 2)`,
        );

      const resultados = await Promise.allSettled([salida(), salida()]);
      const exitos = resultados.filter((r) => r.status === 'fulfilled').length;

      expect(exitos).toBe(1);
      expect((await stockActual(zonaId)).cajas).toBe(1);
    });

    it('fn_traspasar mueve stock entre zonas sin alterar el total', async () => {
      await consultar(
        `select fn_traspasar(${varianteId}, ${zonaId}, ${zonaId2}, 1, 'test de traspaso')`,
      );

      expect((await stockActual(zonaId)).cajas).toBe(0);
      expect((await stockActual(zonaId2)).cajas).toBe(1);
    });

    it('fn_anular_movimiento registra el inverso y restituye el stock', async () => {
      const [mov] = await consultar(
        `insert into movimiento (variante_id, zona_id, tipo, cajas)
       values (${varianteId}, ${zonaId2}, 'SALIDA', 1) returning id`,
      );
      expect((await stockActual(zonaId2)).cajas).toBe(0);

      const [anulacion] = await consultar(
        `select fn_anular_movimiento(${n(mov, 'id')}, 'test de anulación') as id`,
      );

      expect((await stockActual(zonaId2)).cajas).toBe(1);

      // El inverso queda enlazado al original y no se puede anular dos veces.
      const [inverso] = await consultar(
        `select tipo, anulado_por from movimiento where id = ${n(anulacion, 'id')}`,
      );
      expect(inverso?.tipo).toBe('ENTRADA');
      expect(n(inverso, 'anulado_por')).toBe(n(mov, 'id'));

      await expect(
        consultar(`select fn_anular_movimiento(${n(mov, 'id')}, 'segunda vez')`),
      ).rejects.toThrow(/ya fue anulado/);
    });

    it('el kardex concilia con la existencia (sin descuadres)', async () => {
      const [kardex] = await consultar(`
      select coalesce(sum(case
        when tipo in ('ENTRADA', 'AJUSTE_POSITIVO', 'TRASPASO_ENTRADA') then cajas
        else -cajas
      end), 0) as neto
      from movimiento where variante_id = ${varianteId}`);

      const [existencia] = await consultar(
        `select coalesce(sum(cajas), 0) as total from stock where variante_id = ${varianteId}`,
      );

      expect(n(kardex, 'neto')).toBe(n(existencia, 'total'));
    });
  },
);

describe.runIf(!hayCredenciales)('inventario (integración)', () => {
  it.skip('omitidos: no hay .env.local con credenciales de Supabase', () => {});
});
