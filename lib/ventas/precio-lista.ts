'use server';

import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { convertirAPesos } from './conversion';

/**
 * Por qué el precio de venta quedó como quedó. Se muestra en pantalla, así que
 * cada caso tiene que poder explicarse en una frase.
 */
export type MotivoPrecio =
  | 'mismo' // La venta va en la moneda de la lista: se usa tal cual.
  | 'convertido' // La venta va en pesos: se multiplicó por el tipo de cambio.
  | 'sin_lista' // No hay una sola lista activa que aplicar.
  | 'articulo_sin_precio' // Hay lista, pero el artículo no está en ella.
  | 'moneda_no_soportada' // La lista no está en dólares: no hay conversión.
  | 'tipo_cambio_invalido'; // El documento no trae un tipo de cambio utilizable.

/** Lo que dice la lista de precios del cliente sobre un artículo. */
export interface PrecioDeLista {
  /** Precio tal como está en la lista, en su moneda (hoy siempre USD). */
  precioLista: number | null;
  monedaLista: string;
  /** Nombre de la lista aplicada, o `null` si no había ninguna que aplicar. */
  lista: string | null;
  monedaVenta: string;
  /** Ya en la moneda de la venta, o `null` si no se pudo calcular. */
  precioVenta: number | null;
  /** Pesos por dólar en esta venta. Siempre presente desde la migración 0025. */
  tipoCambio: number;
  /** El producto exacto antes de redondear, para poder mostrar la cuenta. */
  precioExacto: number | null;
  motivo: MotivoPrecio;
}

/**
 * Precio de venta del artículo para el cliente de una venta.
 *
 * Los precios se deciden en dólares —es la moneda en la que se compra, así que
 * es la única en la que costo y precio son comparables— y la lista los guarda
 * en dólares. Cuando la venta va en pesos se convierte con el tipo de cambio
 * **de la cabecera de la venta**, no con el de la tabla `tipo_cambio`: el de la
 * cabecera es el que regía el día que se emitió y no debe moverse si la tabla
 * se actualiza después.
 *
 * Ese tipo de cambio ya no lo teclea nadie ni puede faltar: lo pone
 * `fn_documento_tipo_cambio` al crear la venta, tomándolo del único lugar donde
 * se mantiene (Maestros › Tipo de cambio), y la columna es `not null`.
 *
 * `venta_detalle.precio_caja` no guarda moneda propia —se lee en la de la
 * cabecera—, así que lo que se devuelve en `precioVenta` es lo que hay que
 * grabar. Si no se puede calcular, es `null` y hay que escribirlo a mano.
 *
 * **La lista no se asigna cliente por cliente.** Mientras haya una sola lista
 * activa, esa es la de todos: el cliente nuevo que nadie se acordó de
 * configurar vende a los mismos precios que el resto. Si alguna vez vuelve a
 * haber dos —mayorista y minorista—, elegir una sería adivinar, así que el
 * precio se pide a mano; es la misma regla que ya aplica
 * `fn_confirmar_importacion` al publicar.
 *
 * Devuelve `null` solo si la venta no existe. Cuando no hay precio que
 * ofrecer, devuelve el motivo —`sin_lista` o `articulo_sin_precio`— para que
 * la pantalla pueda decirlo en vez de dejar la línea vacía en silencio.
 */
export async function precioDeLista(
  ventaId: number,
  varianteId: number,
): Promise<PrecioDeLista | null> {
  /*
   * Es un Server Action: lo llama un componente de cliente y, por tanto,
   * cualquiera que tenga sesión puede invocarlo con el `ventaId` y el
   * `varianteId` que quiera. La RLS de `venta` y `lista_precio_item` es la que
   * de verdad decide qué filas se leen, pero exigir el permiso aquí evita que
   * la puerta quede abierta a quien ni siquiera entra al módulo de ventas.
   */
  await requerirPermiso('venta.ver');

  const supabase = await crearClienteServidor();

  const { data: venta } = await supabase
    .from('venta')
    .select(
      'tipo_cambio, moneda:moneda_id(codigo), cliente:cliente_id(lista:lista_precio_id(id, nombre, moneda:moneda_id(codigo)))',
    )
    .eq('id', ventaId)
    .maybeSingle();

  if (!venta) return null;

  const monedaVenta = venta.moneda?.codigo ?? '—';
  const tipoCambio = Number(venta.tipo_cambio);

  /*
   * La lista del cliente, si la tiene; si no, la única activa del sistema.
   * El `limit(2)` no oculta filas: la pregunta es «¿hay exactamente una?», y
   * dos ya bastan para responder que no.
   */
  let lista: { id: number; nombre: string; moneda: { codigo: string } | null } | null =
    venta.cliente?.lista ?? null;

  if (!lista) {
    const { data: activas } = await supabase
      .from('lista_precio')
      .select('id, nombre, moneda:moneda_id(codigo)')
      .eq('activo', true)
      .limit(2);

    lista = activas?.length === 1 ? (activas[0] ?? null) : null;
  }

  const sinLista = {
    precioLista: null,
    monedaLista: '—',
    lista: null,
    monedaVenta,
    tipoCambio,
    precioVenta: null,
    precioExacto: null,
  };

  if (!lista) return { ...sinLista, motivo: 'sin_lista' };

  const { data: item } = await supabase
    .from('lista_precio_item')
    .select('precio_caja')
    .eq('lista_id', lista.id)
    .eq('variante_id', varianteId)
    .maybeSingle();

  const monedaLista = lista.moneda?.codigo ?? '—';

  if (!item) {
    return {
      ...sinLista,
      monedaLista,
      lista: lista.nombre,
      motivo: 'articulo_sin_precio',
    };
  }

  const precioLista = Number(item.precio_caja);

  const comun = { precioLista, monedaLista, lista: lista.nombre, monedaVenta, tipoCambio };

  if (monedaLista === monedaVenta) {
    return { ...comun, precioVenta: precioLista, precioExacto: precioLista, motivo: 'mismo' };
  }

  // El tipo de cambio de la venta dice cuántos pesos vale un dólar, así que
  // solo sirve para ese par. Una lista en euros no se sabe convertir.
  if (monedaVenta === 'CLP' && monedaLista === 'USD') {
    const convertido = convertirAPesos(precioLista, tipoCambio);

    // Sin un tipo de cambio utilizable no se inventa un precio: se pide a mano.
    // Un cero aquí se cobraría, y nadie lo habría decidido.
    if (convertido === null) {
      return { ...comun, precioVenta: null, precioExacto: null, motivo: 'tipo_cambio_invalido' };
    }

    return {
      ...comun,
      precioVenta: convertido.redondeado,
      precioExacto: convertido.exacto,
      motivo: 'convertido',
    };
  }

  return { ...comun, precioVenta: null, precioExacto: null, motivo: 'moneda_no_soportada' };
}
