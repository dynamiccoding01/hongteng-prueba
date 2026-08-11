/**
 * Paleta de identificación de bodegas (MAE-04).
 *
 * Pocas bodegas y muchas zonas: el color es lo que permite ver a qué bodega
 * pertenece una zona sin leer la columna. La paleta es cerrada y coincide con
 * el CHECK `bodega_color_ck` de la migración 0016.
 *
 * Aquí no se elige ningún color: el color de una bodega lo asigna la base al
 * crearla y no se edita (0017 y 0018). Este módulo solo traduce el valor
 * guardado a clases de Tailwind.
 *
 * Las clases se escriben COMPLETAS a propósito. Tailwind busca literales en el
 * código fuente; una clase armada como `bg-${color}-100` no existiría en el CSS
 * generado y el color simplemente no se vería.
 */

export interface EstiloColor {
  /** Insignia con el código de la bodega: fondo y texto, en ambos temas. */
  distintivo: string;
  /** Círculo sólido, para las listas donde no cabe la insignia entera. */
  punto: string;
  /** Franja lateral de la fila. */
  borde: string;
  /** Realce de la opción elegida en el selector. */
  anillo: string;
}

export const COLORES_BODEGA = {
  azul: {
    distintivo: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    punto: 'bg-sky-500',
    borde: 'border-l-sky-500',
    anillo: 'ring-sky-500',
  },
  verde: {
    distintivo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    punto: 'bg-emerald-500',
    borde: 'border-l-emerald-500',
    anillo: 'ring-emerald-500',
  },
  ambar: {
    distintivo: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    punto: 'bg-amber-500',
    borde: 'border-l-amber-500',
    anillo: 'ring-amber-500',
  },
  rojo: {
    distintivo: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    punto: 'bg-red-500',
    borde: 'border-l-red-500',
    anillo: 'ring-red-500',
  },
  violeta: {
    distintivo: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    punto: 'bg-violet-500',
    borde: 'border-l-violet-500',
    anillo: 'ring-violet-500',
  },
  cian: {
    distintivo: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    punto: 'bg-cyan-500',
    borde: 'border-l-cyan-500',
    anillo: 'ring-cyan-500',
  },
  rosa: {
    distintivo: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
    punto: 'bg-pink-500',
    borde: 'border-l-pink-500',
    anillo: 'ring-pink-500',
  },
  gris: {
    distintivo: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    punto: 'bg-zinc-400',
    borde: 'border-l-zinc-400',
    anillo: 'ring-zinc-400',
  },
} as const satisfies Record<string, EstiloColor>;

export type ColorBodega = keyof typeof COLORES_BODEGA;

/**
 * El respaldo si llega algo inesperado, y también lo que la base guarda
 * mientras el trigger todavía no asignó color. Nunca es un color de bodega.
 */
const COLOR_POR_DEFECTO: ColorBodega = 'gris';

function esColorBodega(valor: unknown): valor is ColorBodega {
  return typeof valor === 'string' && valor in COLORES_BODEGA;
}

/**
 * Estilo de un color guardado. La columna es `text` con un CHECK, así que en
 * TypeScript llega como `string`: si alguna vez trae otra cosa, se cae al gris
 * en vez de dejar la fila sin clases.
 */
export function estiloBodega(color: string | null | undefined): EstiloColor {
  return COLORES_BODEGA[esColorBodega(color) ? color : COLOR_POR_DEFECTO];
}
