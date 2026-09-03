'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';
import { precioDeLista, type PrecioDeLista } from '@/lib/ventas/precio-lista';
import { descuentoParaSubtotal } from '@/lib/ventas/descuento';

const esquemaCabecera = z.object({
  cliente_id: z.coerce.number().int().positive('Seleccione el cliente'),
  moneda_id: z.coerce.number().int().positive('Seleccione la moneda'),
  fecha: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

/**
 * VEN-01: crea una nota de venta en estado BORRADOR.
 *
 * El tipo de cambio no viene del formulario: lo pone `fn_documento_tipo_cambio`
 * con el oficial de la fecha (migración 0025). Se decidió así porque de ese
 * número sale el precio en pesos de cada línea, y tecleado en cada venta no
 * había nada contra qué comparar un error de digitación.
 */
export async function crearVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.safeParse({
    cliente_id: datos.get('cliente_id'),
    moneda_id: datos.get('moneda_id'),
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('venta').insert({
    cliente_id: analisis.data.cliente_id,
    moneda_id: analisis.data.moneda_id,
    fecha: analisis.data.fecha || undefined,
    notas: analisis.data.notas ?? null,
  });

  if (error) return { error: mensajeError(error, 'venta') };

  revalidatePath('/ventas/notas');
  return { ok: 'Nota de venta creada como borrador' };
}

/**
 * VEN-01: corrige la cabecera de un borrador.
 *
 * El `update` lleva la lista de columnas explícita y **`estado` no está en
 * ella**: pasar de BORRADOR a CONFIRMADA solo puede hacerlo
 * `fn_confirmar_venta`, que es quien genera las SALIDAS. Sellar la venta por
 * fuera la dejaría cobrada y con el stock intacto.
 *
 * Que solo se editen los borradores no lo decide este código: lo impone
 * `tr_venta_confirmada_inmutable` en la base.
 *
 * El tipo de cambio tampoco está: queda congelado como se creó la venta. Si se
 * pudiera mover aquí, las líneas ya cargadas conservarían el precio en pesos
 * calculado con el valor anterior y la venta quedaría contándose dos historias.
 */
export async function editarVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.extend({ id: z.coerce.number().int().positive() }).safeParse({
    id: datos.get('id'),
    cliente_id: datos.get('cliente_id'),
    moneda_id: datos.get('moneda_id'),
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('venta')
    .update({
      cliente_id: analisis.data.cliente_id,
      moneda_id: analisis.data.moneda_id,
      fecha: analisis.data.fecha || undefined,
      notas: analisis.data.notas ?? null,
    })
    .eq('id', analisis.data.id);

  if (error) return { error: mensajeError(error, 'venta') };

  revalidatePath('/ventas/notas');
  return { ok: 'Nota de venta actualizada' };
}

const esquemaDetalle = z.object({
  venta_id: z.coerce.number().int().positive(),
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_id: z.coerce.number().int().positive('Seleccione la zona de origen'),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  precio_caja: z.coerce.number().min(0, 'Precio no válido').optional(),
  /*
   * VEN-07: lo que se escribió en «Subtotal». Llega el subtotal acordado y no
   * la rebaja porque es lo que se habla en el mostrador; el descuento se saca
   * de la resta, ya con el precio que manda el servidor.
   */
  subtotal: z.coerce.number().min(0, 'Subtotal no válido').optional(),
});

/**
 * VEN-02/04: agrega una línea. Si no se indica precio, se toma de la lista
 * de precios del cliente (cuando la tiene y el artículo está en ella).
 */
export async function agregarDetalleVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaDetalle.safeParse({
    venta_id: datos.get('venta_id'),
    variante_id: datos.get('variante_id'),
    zona_id: datos.get('zona_id'),
    cajas: datos.get('cajas'),
    precio_caja: datos.get('precio_caja') || undefined,
    subtotal: datos.get('subtotal') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();

  const lista = await precioDeLista(analisis.data.venta_id, analisis.data.variante_id);
  const fallo = motivoSinPrecio(lista);

  if (fallo && analisis.data.precio_caja === undefined) return { error: fallo };

  /*
   * El precio de la lista manda sobre lo que venga del formulario: si el
   * cliente tiene lista y el artículo está en ella, ese es el precio —ya
   * convertido a la moneda de la venta— y no se negocia desde aquí. Por eso el
   * campo se muestra bloqueado, y por eso tampoco se acepta otro aunque
   * alguien manipule el envío.
   */
  const precio = lista?.precioVenta ?? analisis.data.precio_caja ?? null;

  /*
   * VEN-07: el descuento se calcula aquí, contra el precio que acaba de
   * resolverse, y no se acepta ya calculado desde el formulario. Si se
   * confiara en lo que llega, un subtotal enviado a mano rebajaría una línea
   * cuyo precio el servidor resolvió más alto.
   */
  const rebaja = descuentoParaSubtotal(analisis.data.cajas, precio, analisis.data.subtotal);
  if ('error' in rebaja) return { error: rebaja.error };

  const { error } = await supabase.from('venta_detalle').insert({
    venta_id: analisis.data.venta_id,
    variante_id: analisis.data.variante_id,
    zona_id: analisis.data.zona_id,
    cajas: analisis.data.cajas,
    precio_caja: precio,
    descuento: rebaja.descuento,
    // `subtotal` no se escribe: es una columna generada (migración 0029). Los
    // tipos la dejan pasar como opcional, pero PostgreSQL rechaza el insert.
  });

  if (error) return { error: mensajeError(error, 'detalle') };

  revalidatePath('/ventas/notas');
  return { ok: conDescuento(mensajeDePrecio(lista), rebaja.descuento) };
}

/**
 * Por qué no se puede tomar el precio de la lista, si es que no se puede.
 * Devuelve `null` cuando sí se puede o cuando no hay lista que aplicar.
 *
 * Desde la migración 0025 solo queda un motivo: una lista en una moneda que no
 * es el dólar. Las ventas se emiten en dólares o en pesos y siempre llevan
 * tipo de cambio, así que la conversión nunca se queda sin datos.
 */
function motivoSinPrecio(lista: PrecioDeLista | null): string | null {
  if (!lista || lista.precioVenta !== null) return null;

  return (
    `La lista «${lista.lista}» está en ${lista.monedaLista} y esta venta va en ` +
    `${lista.monedaVenta}: solo se sabe convertir de dólares a pesos, escriba el precio`
  );
}

/** Qué se le dice a quien acaba de guardar, según de dónde salió el precio. */
function mensajeDePrecio(lista: PrecioDeLista | null): string {
  if (!lista || lista.precioVenta === null) return 'Detalle agregado';

  if (lista.motivo === 'convertido') {
    return (
      `Detalle agregado a ${lista.precioVenta} ${lista.monedaVenta} ` +
      `(${lista.precioLista} ${lista.monedaLista} × ${lista.tipoCambio}, subido a la centena)`
    );
  }

  return `Detalle agregado a ${lista.precioVenta} según la lista «${lista.lista}»`;
}

/**
 * VEN-07: si se rebajó algo, se dice. Un descuento que se aplica en silencio
 * es justo el que después nadie recuerda haber autorizado.
 */
function conDescuento(mensaje: string, descuento: number): string {
  return descuento > 0 ? `${mensaje}. Con ${descuento} de descuento` : mensaje;
}

const esquemaLinea = z.object({
  id: z.coerce.number().int().positive(),
  zona_id: z.coerce.number().int().positive('Seleccione la zona de origen'),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  precio_caja: z.coerce.number().min(0, 'Precio no válido').optional(),
  subtotal: z.coerce.number().min(0, 'Subtotal no válido').optional(),
});

/**
 * VEN-02: corrige una línea del detalle.
 *
 * No se cambia el artículo: cambiarlo es otra línea, no una corrección de
 * esta. Lo que sí se corrige es de dónde sale, cuánto y a qué precio, que es
 * justo lo que se equivoca al digitar.
 *
 * Aquí no se comprueba la existencia contra `stock`: hacerlo sería leer y
 * después escribir, con una carrera en medio. La comprobación de verdad ocurre
 * al confirmar, cuando el trigger del movimiento aplica el descuento; el
 * formulario ya avisa antes con el máximo de la zona.
 */
export async function editarLineaVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaLinea.safeParse({
    id: datos.get('id'),
    zona_id: datos.get('zona_id'),
    cajas: datos.get('cajas'),
    precio_caja: datos.get('precio_caja') || undefined,
    subtotal: datos.get('subtotal') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();

  // Misma regla que al agregar: si hay precio de lista en la moneda de la
  // venta, ese manda. Si no se comprobara aquí, el precio bloqueado en un
  // formulario se podría cambiar desde el otro.
  const { data: linea } = await supabase
    .from('venta_detalle')
    .select('venta_id, variante_id')
    .eq('id', analisis.data.id)
    .maybeSingle();

  if (!linea) return { error: 'La línea ya no existe' };

  const lista = await precioDeLista(linea.venta_id, linea.variante_id);
  const fallo = motivoSinPrecio(lista);

  if (fallo && analisis.data.precio_caja === undefined) return { error: fallo };

  const precio = lista?.precioVenta ?? analisis.data.precio_caja ?? null;

  const rebaja = descuentoParaSubtotal(analisis.data.cajas, precio, analisis.data.subtotal);
  if ('error' in rebaja) return { error: rebaja.error };

  const { error } = await supabase
    .from('venta_detalle')
    .update({
      zona_id: analisis.data.zona_id,
      cajas: analisis.data.cajas,
      precio_caja: precio,
      descuento: rebaja.descuento,
    })
    .eq('id', analisis.data.id);

  if (error) return { error: mensajeError(error, 'detalle') };

  revalidatePath('/ventas/notas');
  return { ok: conDescuento('Línea actualizada', rebaja.descuento) };
}

/**
 * VEN-02: quita una línea del detalle.
 *
 * Solo funciona mientras la venta esté en BORRADOR, y eso lo impone
 * `tr_venta_detalle_solo_borrador` en la base, no este código.
 */
export async function eliminarLineaVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = z.coerce.number().int().positive().safeParse(datos.get('id'));

  if (!analisis.success) return { error: 'Línea no válida' };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('venta_detalle').delete().eq('id', analisis.data);

  if (error) return { error: mensajeError(error, 'detalle') };

  revalidatePath('/ventas/notas');
  return { ok: 'Línea eliminada' };
}

const esquemaConfirmacion = z.object({
  venta_id: z.coerce.number().int().positive(),
});

/** VEN-02: confirma y descuenta stock (todo o nada; el sobregiro falla). */
export async function confirmarVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaConfirmacion.safeParse({ venta_id: datos.get('venta_id') });

  if (!analisis.success) {
    return { error: 'Venta no válida' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_confirmar_venta', {
    p_venta_id: analisis.data.venta_id,
  });

  if (error) return { error: mensajeError(error, 'venta') };

  // Confirmar mueve la venta de una pantalla a la otra: las dos cambian.
  revalidatePath('/ventas/notas');
  revalidatePath('/ventas/confirmadas');
  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  return { ok: 'Venta confirmada: stock descontado' };
}
