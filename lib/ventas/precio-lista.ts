'use server';

import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { convertirAPesos } from './conversion';

/**
 * Por qué el precio de venta quedó como quedó. Se muestra en pantalla, así que
 * cada caso tiene que poder explicarse en una frase.
 */
export type MotivoPrecio =
  | 'mismo' // La venta va en la moneda de la lista: se usa tal cual.
  | 'convertido' // La venta va en pesos: se multiplicó por el tipo de cambio.
  | 'moneda_no_soportada'; // La lista no está en dólares: no hay conversión.

/** Lo que dice la lista de precios del cliente sobre un artículo. */
export interface PrecioDeLista {
  /** Precio tal como está en la lista, en su moneda (hoy siempre USD). */
  precioLista: number;
  monedaLista: string;
  lista: string;
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
 * Devuelve `null` cuando el cliente no tiene lista o el artículo no está en
 * ella.
 */
export async function precioDeLista(
  ventaId: number,
  varianteId: number,
): Promise<PrecioDeLista | null> {
  await requerirUsuario();

  const supabase = await crearClienteServidor();

  const { data: venta } = await supabase
    .from('venta')
    .select(
      'tipo_cambio, moneda:moneda_id(codigo), cliente:cliente_id(lista:lista_precio_id(id, nombre, moneda:moneda_id(codigo)))',
    )
    .eq('id', ventaId)
    .maybeSingle();

  const lista = venta?.cliente?.lista;
  if (!venta || !lista) return null;

  const { data: item } = await supabase
    .from('lista_precio_item')
    .select('precio_caja')
    .eq('lista_id', lista.id)
    .eq('variante_id', varianteId)
    .maybeSingle();

  if (!item) return null;

  const precioLista = Number(item.precio_caja);
  const monedaLista = lista.moneda?.codigo ?? '—';
  const monedaVenta = venta.moneda?.codigo ?? '—';
  const tipoCambio = Number(venta.tipo_cambio);

  const comun = { precioLista, monedaLista, lista: lista.nombre, monedaVenta, tipoCambio };

  if (monedaLista === monedaVenta) {
    return { ...comun, precioVenta: precioLista, precioExacto: precioLista, motivo: 'mismo' };
  }

  // El tipo de cambio de la venta dice cuántos pesos vale un dólar, así que
  // solo sirve para ese par. Una lista en euros no se sabe convertir.
  if (monedaVenta === 'CLP' && monedaLista === 'USD') {
    const { exacto, redondeado } = convertirAPesos(precioLista, tipoCambio);
    return { ...comun, precioVenta: redondeado, precioExacto: exacto, motivo: 'convertido' };
  }

  return { ...comun, precioVenta: null, precioExacto: null, motivo: 'moneda_no_soportada' };
}
