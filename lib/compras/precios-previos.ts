'use server';

import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';

/** Lo que ya se sabe de los precios de un artículo, para proponerlos al comprar. */
export interface PreciosPrevios {
  /** Lo que se pagó por caja la última vez, en USD. */
  costo: number | null;
  /** Fecha de esa compra, para que se vea si el dato está viejo. */
  costoFecha: string | null;
  /** Importación de la que salió: permite ir a mirarla si algo no cuadra. */
  costoImportacion: number | null;
  /** A cuánto se vende hoy la caja, en USD. */
  venta: number | null;
  /** De dónde salió el precio de venta, para poder juzgarlo. */
  ventaOrigen: string | null;
  /**
   * VEN-07: lo que de verdad se cobró por caja la última vez, en USD.
   *
   * Desde que hay descuento por artículo, el precio de la lista y lo cobrado
   * dejaron de ser la misma cifra. La lista sigue siendo la propuesta —es la
   * decisión vigente— pero al lado tiene que verse a cuánto se cerró de verdad:
   * si la lista dice 38 y la última venta salió a 34, eso es lo que hay que
   * saber antes de fijar el precio de esta compra.
   */
  cobrado: number | null;
  cobradoFecha: string | null;
  cobradoCliente: string | null;
}

const VACIO: PreciosPrevios = {
  costo: null,
  costoFecha: null,
  costoImportacion: null,
  venta: null,
  ventaOrigen: null,
  cobrado: null,
  cobradoFecha: null,
  cobradoCliente: null,
};

/**
 * Precios ya conocidos de un artículo, para rellenar el detalle de una compra.
 *
 * Nadie se acuerda de a cuánto compró un código hace cuatro meses ni de a
 * cuánto lo está vendiendo hoy, y buscarlo en otra pantalla mientras se carga
 * una importación de treinta líneas es donde se cometen los errores. Así que se
 * proponen, con su procedencia a la vista: son un punto de partida, no una
 * decisión tomada.
 *
 * Las dos cifras salen de sitios distintos a propósito:
 *
 *   · El **costo** es el de la última importación confirmada. Es un hecho: lo
 *     que se pagó de verdad la última vez.
 *   · La **venta** sale de la lista de precios vigente, no de lo que se decidió
 *     la vez pasada al comprar. La lista es a lo que se está vendiendo hoy, y
 *     puede haberse ajustado después de aquella compra.
 *
 * Solo se mira la lista activa en USD, y solo si hay exactamente una: con dos
 * listas activas en la misma moneda, elegir una sería adivinar. Es el mismo
 * criterio que usa `fn_confirmar_importacion` al publicar precios.
 */
export async function preciosPrevios(varianteId: number): Promise<PreciosPrevios> {
  await requerirUsuario();

  const supabase = await crearClienteServidor();

  const [{ data: ultima }, { data: listas }, { data: ultimaVenta }] = await Promise.all([
    // Ordenado por id de la línea y no por fecha del documento: el id crece con
    // la carga, así que la línea más alta es la última que alguien escribió,
    // que es la referencia que se busca aquí.
    //
    // El filtro por USD **no es decorativo**. Desde la migración 0024 toda
    // importación va en dólares, pero las anteriores no: en los datos de hoy
    // hay una en pesos, y su costo de 1.200 CLP propuesto como 1.200 USD sería
    // un error de mil veces metido de entrada en el precio de venta.
    supabase
      .from('importacion_detalle')
      .select(
        'costo_caja, importacion:importacion_id!inner(id, fecha, estado, moneda:moneda_id!inner(codigo))',
      )
      .eq('variante_id', varianteId)
      .eq('importacion.estado', 'CONFIRMADA')
      .eq('importacion.moneda.codigo', 'USD')
      .not('costo_caja', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('lista_precio')
      .select('id, nombre, moneda:moneda_id!inner(codigo)')
      .eq('moneda.codigo', 'USD')
      .eq('activo', true),
    // VEN-07: la última venta confirmada del artículo, para saber a cuánto se
    // cerró de verdad. Solo en dólares y por la misma razón que el costo: en
    // pesos la cifra no es comparable sin arrastrar una conversión del día.
    // Se lee `subtotal` —la columna generada, ya con el descuento restado— y no
    // `precio_caja`, que es el de lista y es justo lo que aquí no se pregunta.
    supabase
      .from('venta_detalle')
      .select(
        'cajas, subtotal, venta:venta_id!inner(fecha, estado, cliente:cliente_id(nombre), moneda:moneda_id!inner(codigo))',
      )
      .eq('variante_id', varianteId)
      .eq('venta.estado', 'CONFIRMADA')
      .eq('venta.moneda.codigo', 'USD')
      .not('subtotal', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lista = listas?.length === 1 ? listas[0] : undefined;

  const { data: item } = lista
    ? await supabase
        .from('lista_precio_item')
        .select('precio_caja')
        .eq('lista_id', lista.id)
        .eq('variante_id', varianteId)
        .maybeSingle()
    : { data: null };

  // Lo cobrado por caja es el subtotal de la línea repartido entre sus cajas:
  // es la única forma de comparar con un precio de lista cuando la rebaja se
  // acordó sobre el total de la línea y no por unidad.
  const cajasVendidas = ultimaVenta ? Number(ultimaVenta.cajas) : 0;
  const cobrado =
    ultimaVenta && ultimaVenta.subtotal !== null && cajasVendidas > 0
      ? Math.round((Number(ultimaVenta.subtotal) / cajasVendidas) * 10_000) / 10_000
      : null;

  return {
    ...VACIO,
    costo: ultima?.costo_caja === undefined ? null : Number(ultima.costo_caja),
    costoFecha: ultima?.importacion.fecha ?? null,
    costoImportacion: ultima?.importacion.id ?? null,
    venta: item ? Number(item.precio_caja) : null,
    ventaOrigen: item && lista ? lista.nombre : null,
    cobrado,
    cobradoFecha: cobrado === null ? null : (ultimaVenta?.venta.fecha ?? null),
    cobradoCliente: cobrado === null ? null : (ultimaVenta?.venta.cliente?.nombre ?? null),
  };
}
