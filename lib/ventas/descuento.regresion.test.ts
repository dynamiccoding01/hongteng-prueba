/**
 * REGRESIONES ABIERTAS · VEN-07 (descuento por artículo).
 *
 * Estos tests describen fallos REALES que el código de hoy no supera. Están
 * escritos en rojo a propósito: son la lista de trabajo, no una red de
 * seguridad ya cumplida. Cada `it` lleva el identificador con el que aparece
 * en REVISION_CRITICA.md.
 *
 * Cuando uno se arregle, se mueve a `descuento.test.ts` con el resto.
 */

import { describe, expect, it } from 'vitest';
import {
  descuentoParaSubtotal,
  descuentoVigente,
  subtotalBruto,
  subtotalConDescuento,
} from './descuento';

/**
 * El importe EXACTO de una línea tal como lo calcula PostgreSQL.
 *
 * No es lo mismo que `subtotalBruto`: la base multiplica `numeric(14,2)` por
 * `numeric(14,4)` en aritmética decimal exacta —hasta seis decimales— mientras
 * que aquí se multiplica en coma flotante y se recorta a cuatro. Esa diferencia
 * es justo lo que miden los tests de abajo.
 */
function importeExacto(cajas: string, precio: string): number {
  // `cajas` tiene 2 decimales y `precio` 4: en enteros el producto queda
  // expresado en millonesimas, que es la unidad con la que se compara abajo.
  return Math.round(Number(cajas) * 100) * Math.round(Number(precio) * 10_000);
}

describe('D-01 · el descuento no puede pasarse del importe que ve la base', () => {
  /*
   * `venta_detalle_descuento_ck` (migración 0029) exige
   * `descuento <= cajas * precio_caja` con la multiplicación EXACTA de
   * PostgreSQL. `descuentoParaSubtotal` redondea el bruto a 4 decimales, y ese
   * redondeo puede subir: entonces manda un descuento mayor que el importe real
   * y el insert revienta con un error de constraint que el usuario ve en crudo.
   */

  it('D-01a: 0,05 cajas × 20,0010 con subtotal 0 no puede rebajar más de 1,00005', () => {
    const r = descuentoParaSubtotal(0.05, 20.001, 0);
    if ('error' in r) throw new Error(r.error);
    // Exacto en la base: 1,000050. Hoy `redondearDinero` devuelve 1,0001.
    expect(r.descuento).toBeLessThanOrEqual(1.00005);
  });

  it('D-01b: 1,23 cajas × 9,8765 con subtotal 0 no puede rebajar más de 12,148095', () => {
    const r = descuentoParaSubtotal(1.23, 9.8765, 0);
    if ('error' in r) throw new Error(r.error);
    // Exacto en la base: 12,148095. Hoy devuelve 12,1481.
    expect(r.descuento).toBeLessThanOrEqual(12.148095);
  });

  it('D-01c: el redondeo del bruto nunca sube por encima del producto exacto', () => {
    const casos: [string, string][] = [
      ['0.05', '20.0010'],
      ['1.23', '9.8765'],
      ['0.07', '3.3335'],
      ['2.25', '1.0005'],
    ];
    for (const [cajas, precio] of casos) {
      const bruto = subtotalBruto(Number(cajas), Number(precio));
      expect(bruto).not.toBeNull();
      // Se comparan en enteros para no arrastrar la coma flotante a la propia
      // comprobación: el bruto en millonésimas no puede superar al exacto.
      expect(Math.round((bruto ?? 0) * 1_000_000)).toBeLessThanOrEqual(
        importeExacto(cajas, precio),
      );
    }
  });
});

describe('D-02 · la cantidad se negocia con más decimales de los que se guardan', () => {
  /*
   * `venta_detalle.cajas` es `numeric(14,2)`: PostgreSQL redondea 1,005 a 1,01
   * al guardar. El descuento, en cambio, se calcula aquí sobre 1,005. El
   * resultado es una línea cuyo subtotal guardado no es el que se acordó con el
   * cliente, sin un solo aviso por el camino.
   */

  it('D-02a: una cantidad con tres decimales se rechaza en vez de calcular sobre ella', () => {
    const r = descuentoParaSubtotal(1.005, 100, 100);
    expect('error' in r).toBe(true);
  });

  it('D-02b: dos decimales —lo que sí se guarda— siguen siendo válidos', () => {
    const r = descuentoParaSubtotal(1.01, 100, 100);
    expect('error' in r).toBe(false);
  });
});

describe('D-03 · una cantidad imposible no puede pasar como «sin descuento»', () => {
  /*
   * Con `cajas` no finita, `subtotalBruto` devuelve null y
   * `descuentoParaSubtotal` responde `{ descuento: 0 }`: da por bueno un
   * formulario que pedía rebajar. Hoy el Zod del `acciones.ts` filtra NaN e
   * Infinity antes de llegar, así que esto es defensa en profundidad — pero la
   * función también la llama el componente de cliente, donde no hay Zod.
   */

  it('D-03a: NaN en la cantidad es un error, no un descuento de 0', () => {
    expect('error' in descuentoParaSubtotal(Number.NaN, 850, 5900)).toBe(true);
  });

  it('D-03b: Infinity en la cantidad es un error, no un descuento de 0', () => {
    expect('error' in descuentoParaSubtotal(Number.POSITIVE_INFINITY, 850, 5900)).toBe(true);
  });

  it('D-03c: una cantidad negativa se rechaza como tal, no como «recargo»', () => {
    // Hoy el bruto sale -5950 y el mensaje que ve el usuario es «el subtotal no
    // puede superar los -5950», que no explica nada.
    const r = descuentoParaSubtotal(-7, 850, 0);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).not.toContain('no puede superar');
  });
});

describe('D-05 · importes que se redondean a cero', () => {
  it('D-05: un importe por debajo de la diezmilésima no puede quedar en 0', () => {
    // 0,07 × 0,0005 = 0,000035. La base lo guarda; aquí queda en 0, el campo
    // Subtotal se topa en 0 y cualquier cifra escrita se lee como un recargo.
    expect(subtotalBruto(0.07, 0.0005)).not.toBe(0);
  });
});

describe('D-07 · corregir una línea no puede borrar la rebaja acordada', () => {
  /*
   * `descuentoParaSubtotal` interpreta «no vino el subtotal» como «descuento 0».
   * En un alta es correcto; al CORREGIR una línea que ya tenía rebaja, era una
   * pérdida de dato silenciosa (ver A-01 en acciones-notas.regresion.test.ts).
   *
   * El otro significado vive ahora en `descuentoVigente`, que es lo que llama la
   * acción cuando el formulario no trae subtotal.
   */
  it('D-07a: la rebaja acordada sigue en pie si no se toca el subtotal', () => {
    expect(descuentoVigente(7, 850, 50)).toEqual({ descuento: 50 });
  });

  it('D-07b: viaja la rebaja, no el subtotal: al subir la cantidad sigue siendo 50', () => {
    // 7 cajas a 850 se cerraron en 5.900. Con 10 cajas el bruto es 8.500 y lo
    // acordado son 8.450: arrastrar los 5.900 habría regalado 2.600.
    expect(descuentoVigente(10, 850, 50)).toEqual({ descuento: 50 });
    expect(subtotalConDescuento(10, 850, 50)).toBe(8450);
  });

  it('D-07c: si la rebaja ya no cabe en la línea, se avisa en vez de recortarla', () => {
    const r = descuentoVigente(0.05, 850, 50); // el bruto son 42,50
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('ya no cabe');
  });

  it('D-07d: sin precio la rebaja es 0, que es lo único que admite la base', () => {
    expect(descuentoVigente(7, null, 50)).toEqual({ descuento: 0 });
  });
});

describe('D-08 · el 100 % de descuento no tiene tope ni autorización', () => {
  /*
   * `descuento(7, 850, 0)` = 5950: la línea se regala. Es coherente con la
   * base (`descuento <= cajas * precio_caja`) y hoy está tomado como decisión,
   * pero no hay tope por rol ni segunda firma: cualquiera con `venta.crear`
   * puede dejar una nota en cero. Queda pendiente confirmarlo con el cliente.
   */
  it.todo('D-08: decidir si hay un tope de descuento por rol y aplicarlo');
});
