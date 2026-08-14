import { numero } from '@/components/ui';

/**
 * Cómo se leen los precios de una línea de importación.
 *
 * El precio por unidad no está guardado en ninguna parte: es el de la caja
 * dividido por lo que trae el empaque. Se calcula al mostrarlo, no se
 * almacena, porque dos columnas que dicen lo mismo acaban contradiciéndose en
 * cuanto una se edita y la otra no.
 *
 * Compra y venta comparten la moneda de la cabecera de la importación, así que
 * el margen es una resta exacta y no depende de ningún tipo de cambio.
 */
export interface PreciosLinea {
  compra: string;
  compraUnidad: string;
  venta: string;
  ventaUnidad: string;
  margen: string;
  /** Cierto si el precio de venta quedó bajo el de compra. */
  bajoCosto: boolean;
}

export function preciosLinea(
  costoCaja: number | string | null,
  ventaCaja: number | string | null,
  unidadesPorCaja: number | string,
  simbolo: string | null,
  unidad: string,
): PreciosLinea {
  const signo = simbolo ?? '';
  const porCaja = Number(unidadesPorCaja);
  const compra = costoCaja === null ? null : Number(costoCaja);
  const venta = ventaCaja === null ? null : Number(ventaCaja);

  const unitario = (total: number | null): string =>
    total === null || porCaja <= 0 ? '—' : `${signo} ${numero(total / porCaja)} / ${unidad}`;

  return {
    compra: compra === null ? '—' : `${signo} ${numero(compra)}`,
    compraUnidad: unitario(compra),
    venta: venta === null ? 'sin precio' : `${signo} ${numero(venta)}`,
    ventaUnidad: unitario(venta),
    margen:
      compra === null || venta === null
        ? '—'
        : compra > 0
          ? `${signo} ${numero(venta - compra)} · ${(venta / compra).toFixed(2)}×`
          : `${signo} ${numero(venta - compra)}`,
    bajoCosto: compra !== null && venta !== null && venta < compra,
  };
}
