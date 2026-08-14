/**
 * Conversión de un precio en dólares a pesos chilenos.
 *
 * Los precios se deciden en dólares —es la moneda en la que se compra, así que
 * es la única en la que costo y precio son comparables— y al vender en pesos se
 * multiplican por el tipo de cambio de la venta.
 *
 * El resultado exacto casi nunca cae en una cifra presentable: 38 × 947,30 da
 * 35.997,40. Un precio así en la nota de venta no se puede defender ante el
 * cliente, así que se redondea **hacia arriba a la centena**. Hacia arriba y no
 * al más cercano por una razón concreta: redondear hacia abajo vendería por
 * menos de lo que se fijó en dólares, y ese descuento silencioso nadie lo
 * decidió.
 */

/** A cuánto se redondea un precio en pesos. */
export const REDONDEO_CLP = 100;

export interface PrecioConvertido {
  /** El producto exacto, al centavo. Sirve para mostrar la cuenta. */
  exacto: number;
  /** Lo que se cobra: el exacto subido a la centena. */
  redondeado: number;
}

/**
 * Pasa un precio en dólares a pesos con el tipo de cambio dado.
 *
 * El redondeo se hace aquí y no al mostrar, para que la cifra que se ve en
 * pantalla y la que queda grabada en `venta_detalle.precio_caja` sean la misma.
 */
export function convertirAPesos(precioUsd: number, tipoCambio: number): PrecioConvertido {
  // Al centavo primero: 38 * 947.3 da 35997.399999999994 en coma flotante, y
  // sin este paso el `ceil` de más abajo trabajaría sobre la basura del final.
  const exacto = Math.round(precioUsd * tipoCambio * 100) / 100;

  // `toFixed` antes del `ceil` por lo mismo: un valor que ya es múltiplo de la
  // centena puede quedar representado como 120.00000000000001 y subir una
  // centena entera sin motivo.
  const centenas = Number((exacto / REDONDEO_CLP).toFixed(6));

  return { exacto, redondeado: Math.ceil(centenas) * REDONDEO_CLP };
}
