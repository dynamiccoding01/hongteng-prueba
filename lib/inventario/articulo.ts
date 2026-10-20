/**
 * Forma de un artículo devuelto por el buscador.
 *
 * Va en su propio archivo porque un módulo con `'use server'` solo puede
 * exportar funciones asíncronas: los tipos tienen que vivir aparte.
 */

/** Existencia de un empaque en una zona concreta. */
export interface ExistenciaZona {
  zonaId: number;
  zona: string;
  bodega: string;
  bodegaNombre: string | null;
  color: string;
  cantidad: number;
}

/**
 * Un empaque encontrado, con todo lo que los formularios necesitan saber sin
 * volver a consultar: cuánto trae la caja, en qué se cuenta y dónde hay.
 */
export interface ArticuloEncontrado {
  /** id de `producto_variante`: es a lo que apuntan stock y movimiento. */
  id: number;
  codigo: string;
  descripcion: string | null;
  unidadesPorCaja: number;
  unidad: string;
  existencias: ExistenciaZona[];
}

/** Total disponible del empaque, sumando todas sus zonas. */
export function totalDisponible(a: ArticuloEncontrado): number {
  return a.existencias.reduce((s, e) => s + e.cantidad, 0);
}

/**
 * El envase se llama por su unidad de medida; lo de dentro son unidades.
 *
 * El sistema guarda dos cosas por artículo: `producto.unidad_medida`, que es
 * **cómo se cuenta** —la caja, la docena, el par, el bulto en que la mercadería
 * entra, se guarda y se vende—, y `producto_variante.unidades_por_caja`, que es
 * **cuántas piezas trae** ese envase. Las frases de la interfaz se escriben
 * siempre así: «10 docenas × 8 unidades = 80 unidades».
 *
 * Antes la palabra «caja» estaba escrita a mano en cada frase y la unidad de
 * medida se leía como el contenido: el mismo artículo salía como «8 docena por
 * caja», que no es lo que nadie quiso decir, y un artículo cuya unidad era
 * «Caja» se leía «12 caja por caja». Había una función que lo tapaba
 * imprimiendo «unidades» cuando la unidad contenía la palabra caja; ya no hace
 * falta, porque el nombre del envase y el de su contenido dejaron de competir
 * por el mismo hueco.
 */

/**
 * Excepciones de plural. La regla de abajo resuelve el español corriente
 * (caja → cajas, par → pares); aquí van las palabras que el cliente usa y que
 * la regla erraría, casi todas prestadas del inglés.
 */
const PLURALES: Record<string, string> = {
  pack: 'packs',
  set: 'sets',
  display: 'displays',
  kit: 'kits',
  blister: 'blísteres',
};

/** Vocales con y sin tilde: una palabra que acaba en vocal pluraliza con «s». */
const TERMINA_EN_VOCAL = /[aeiouáéíóú]$/i;

/**
 * El nombre del envase, en singular o en plural según la cantidad.
 *
 * Se escribe en minúscula porque va dentro de una frase («10 docenas»), no
 * como título. Sin unidad —un artículo recién creado, o un dato que no llegó—
 * se dice «empaque», que es la palabra genérica que el resto del sistema ya
 * usa para `producto_variante`.
 */
export function nombreEnvase(unidad: string | null, cantidad = 1): string {
  const singular = (unidad ?? '').trim().toLowerCase() || 'empaque';
  if (cantidad === 1) return singular;

  const excepcion = PLURALES[singular];
  if (excepcion) return excepcion;

  return TERMINA_EN_VOCAL.test(singular) ? `${singular}s` : `${singular}es`;
}

/** Cómo se muestra el artículo una vez elegido: «A2050 — docena de 8 unidades». */
export function etiquetaArticulo(a: ArticuloEncontrado): string {
  return `${a.codigo} — ${nombreEnvase(a.unidad)} de ${a.unidadesPorCaja} ${a.unidadesPorCaja === 1 ? 'unidad' : 'unidades'}`;
}

/** «unidad» o «unidades» según cuántas piezas trae el envase. */
export function piezas(cantidad: number): string {
  return cantidad === 1 ? 'unidad' : 'unidades';
}
