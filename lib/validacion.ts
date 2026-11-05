import { z } from 'zod';

/**
 * Validaciones que se repetían —mal— en casi todos los `acciones.ts`.
 *
 * Son tres fallos con la misma forma, y por eso viven juntas:
 *
 *   1. El `id` de un formulario de edición se leía con `Number(datos.get('id'))`
 *      sin validar: «abc» daba `NaN`, «1.5» llegaba a PostgreSQL como
 *      `id=eq.1.5` y volvía como un error de sintaxis.
 *   2. Un UPDATE o DELETE que la RLS filtra, o que apunta a una fila que ya no
 *      existe, **no da error en PostgREST**: devuelve éxito con cero filas. La
 *      pantalla decía «actualizado» y no se había guardado nada.
 *   3. Las cantidades se guardan en `numeric(14,2)` y la base redondea lo que
 *      sobra sin avisar: 1,005 cajas quedaban en 1,01 (D-02). Lo arregló el
 *      descuento de la venta; la importación, la toma y los movimientos seguían
 *      igual.
 */

/** Lo que se dice cuando una escritura no tocó ninguna fila. */
export const NO_ENCONTRADO =
  'No se guardó nada: el registro ya no existe o su rol no puede modificarlo';

/**
 * El `id` de un formulario que sirve para crear y para editar.
 * Ausente o vacío es un alta; presente tiene que ser un entero positivo.
 */
export function leerId(
  valor: FormDataEntryValue | null,
): { id: number | null } | { error: string } {
  if (valor === null || valor === '') return { id: null };

  const analisis = z.coerce.number().int().positive().safeParse(valor);
  return analisis.success
    ? { id: analisis.data }
    : { error: 'El registro que intenta editar no es válido' };
}

/**
 * ¿Cabe `valor` en una columna con `maximo` decimales sin que la base lo
 * redondee? Se compara con tolerancia porque 12,35 × 100 en coma flotante es
 * 1234,9999999999998, y eso no es un tercer decimal.
 */
export function decimalesValidos(valor: number, maximo: number): boolean {
  if (!Number.isFinite(valor)) return false;
  const escala = 10 ** maximo;
  return Math.abs(Math.round(valor * escala) - valor * escala) < 1e-6;
}

/**
 * Una cantidad de cajas (`numeric(14,2)`): positiva, finita y con dos
 * decimales como mucho. `permiteCero` es para un conteo físico, donde 0 es un
 * resultado válido.
 */
export function esquemaCajas(mensaje: string, permiteCero = false) {
  // Zod 4 ya rechaza NaN e Infinity en `number()`: no hace falta `.finite()`.
  const base = z.coerce.number({ message: mensaje });
  return (permiteCero ? base.min(0, mensaje) : base.positive(mensaje))
    .max(999_999_999_999, 'La cantidad es demasiado grande')
    .refine((v) => decimalesValidos(v, 2), {
      message: 'La cantidad admite dos decimales como mucho: con más, el sistema la redondearía',
    });
}

/**
 * Un importe (`numeric(14,4)`): no negativo, finito y con cuatro decimales
 * como mucho.
 */
export function esquemaImporte(mensaje: string) {
  return z.coerce
    .number({ message: mensaje })
    .min(0, mensaje)
    .max(9_999_999_999, 'El importe es demasiado grande')
    .refine((v) => decimalesValidos(v, 4), {
      message: 'El importe admite cuatro decimales como mucho',
    });
}

/**
 * ¿Una escritura con `.select('id')` no tocó ninguna fila?
 * Ver el punto 2 de arriba: es la única forma de enterarse.
 */
export function sinFilas(filas: readonly unknown[] | null | undefined): boolean {
  return !filas || filas.length === 0;
}
