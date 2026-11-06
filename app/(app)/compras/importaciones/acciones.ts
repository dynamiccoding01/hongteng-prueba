'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';
import { esquemaDia } from '@/lib/fechas';
import { NO_ENCONTRADO, esquemaCajas, esquemaImporte, sinFilas } from '@/lib/validacion';

const esquemaCabecera = z.object({
  proveedor_id: z.coerce.number().int().positive('Seleccione el proveedor'),
  documento_aduana: z
    .string()
    .trim()
    .max(60, 'El documento de aduana no puede pasar de 60 caracteres')
    .optional(),
  /*
   * Mismo arreglo que A-03 hizo en ventas, que aquí faltaba: de la fecha sale
   * el tipo de cambio que `fn_documento_tipo_cambio` congela en la
   * importación, y con él la valorización de todo lo que entra. «mañana»
   * llegaba a PostgreSQL y volvía en inglés; «2026-02-30» ni siquiera existe.
   */
  fecha: esquemaDia.optional(),
  notas: z.string().trim().max(2000, 'Las notas no pueden pasar de 2000 caracteres').optional(),
});

/**
 * COM-01: crea la cabecera de una importación en estado BORRADOR.
 *
 * La moneda no se elige: siempre USD. Es la decisión que ordena todo el
 * costeo —se compra en dólares, y de ahí salen el precio de venta y la lista—
 * y la impone `tr_importacion_solo_usd` en la base. Aquí solo se busca su id
 * para no dejar que el formulario mande una moneda cualquiera.
 *
 * El tipo de cambio tampoco se manda: lo pone `fn_documento_tipo_cambio` con
 * el oficial de la fecha (migración 0025), que se mantiene en Maestros › Tipo
 * de cambio. De ese número sale la valorización del stock en pesos.
 */
export async function crearImportacion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.safeParse({
    proveedor_id: datos.get('proveedor_id'),
    documento_aduana: datos.get('documento_aduana') || undefined,
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();

  const { data: usd } = await supabase
    .from('moneda')
    .select('id')
    .eq('codigo', 'USD')
    .maybeSingle();

  if (!usd) return { error: 'Falta la moneda USD en el maestro de monedas' };

  const { error } = await supabase.from('importacion').insert({
    proveedor_id: analisis.data.proveedor_id,
    moneda_id: usd.id,
    documento_aduana: analisis.data.documento_aduana ?? null,
    fecha: analisis.data.fecha || undefined,
    notas: analisis.data.notas ?? null,
  });

  if (error) return { error: mensajeError(error, 'importación') };

  revalidatePath('/compras/importaciones');
  return { ok: 'Importación creada como borrador' };
}

const esquemaDetalle = z
  .object({
    importacion_id: z.coerce.number().int().positive(),
    variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
    zona_id: z.coerce.number().int().positive('Seleccione la zona de destino'),
    // `numeric(14,2)` y `numeric(14,4)`: lo que no cabe, la base lo redondea
    // sin avisar, y entra a stock una cantidad distinta de la que llegó.
    cajas: esquemaCajas('Las cajas deben ser mayores que cero'),
    costo_caja: esquemaImporte('Costo no válido').optional(),
    precio_venta_caja: esquemaImporte('Precio de venta no válido').optional(),
  })
  // Mismo criterio que `importacion_detalle_margen_ck` en la base. Aquí solo
  // para dar un mensaje en castellano; la barrera es la restricción, que se
  // aplica venga el dato de donde venga.
  .refine(
    (d) =>
      d.costo_caja === undefined ||
      d.precio_venta_caja === undefined ||
      d.precio_venta_caja >= d.costo_caja,
    { message: 'El precio de venta no puede ser menor al costo de compra' },
  );

/** COM-02: agrega una línea de detalle (solo en BORRADOR, lo exige la BD). */
export async function agregarDetalle(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaDetalle.safeParse({
    importacion_id: datos.get('importacion_id'),
    variante_id: datos.get('variante_id'),
    zona_id: datos.get('zona_id'),
    cajas: datos.get('cajas'),
    costo_caja: datos.get('costo_caja') || undefined,
    precio_venta_caja: datos.get('precio_venta_caja') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('importacion_detalle').insert({
    importacion_id: analisis.data.importacion_id,
    variante_id: analisis.data.variante_id,
    zona_id: analisis.data.zona_id,
    cajas: analisis.data.cajas,
    costo_caja: analisis.data.costo_caja ?? null,
    precio_venta_caja: analisis.data.precio_venta_caja ?? null,
  });

  if (error) return { error: mensajeError(error, 'detalle') };

  revalidatePath('/compras/importaciones');
  return { ok: 'Detalle agregado' };
}

/*
 * Corregir y quitar una línea del borrador. La base ya lo permitía desde
 * 0008 —`tr_detalle_solo_borrador` contempla el DELETE y solo lo frena con la
 * importación confirmada—, pero no había ni acción ni botón: lo único que se
 * podía hacer con una línea equivocada era confirmarla.
 *
 * Eso dejaba dos callejones sin salida. Agregar dos veces el mismo artículo
 * obligaba a ingresar a stock cajas que nunca llegaron, y una línea sin costo
 * no se podía arreglar ni sacar: `fn_confirmar_importacion` se niega a
 * confirmar sin importe (0032), así que la importación quedaba en BORRADOR
 * para siempre.
 */
const esquemaEditarLinea = z
  .object({
    id: z.coerce.number().int().positive(),
    zona_id: z.coerce.number().int().positive('Seleccione la zona de destino'),
    cajas: esquemaCajas('Las cajas deben ser mayores que cero'),
    costo_caja: esquemaImporte('Costo no válido').optional(),
    precio_venta_caja: esquemaImporte('Precio de venta no válido').optional(),
  })
  .refine(
    (d) =>
      d.costo_caja === undefined ||
      d.precio_venta_caja === undefined ||
      d.precio_venta_caja >= d.costo_caja,
    { message: 'El precio de venta no puede ser menor al costo de compra' },
  );

/**
 * COM-02: corrige una línea del detalle.
 *
 * El artículo no se cambia —cambiarlo es otra línea, no una corrección de
 * esta—, igual que en la nota de venta. La zona sí, porque equivocarse de
 * destino al digitar es lo habitual.
 */
export async function editarLineaImportacion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaEditarLinea.safeParse({
    id: datos.get('id'),
    zona_id: datos.get('zona_id'),
    cajas: datos.get('cajas'),
    costo_caja: datos.get('costo_caja') || undefined,
    precio_venta_caja: datos.get('precio_venta_caja') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { data: tocadas, error } = await supabase
    .from('importacion_detalle')
    .update({
      zona_id: analisis.data.zona_id,
      cajas: analisis.data.cajas,
      costo_caja: analisis.data.costo_caja ?? null,
      precio_venta_caja: analisis.data.precio_venta_caja ?? null,
    })
    .eq('id', analisis.data.id)
    .select('id');

  if (error) return { error: mensajeError(error, 'detalle') };
  // Sin `importacion.crear` la RLS filtra la escritura y PostgREST responde
  // que todo salió bien: la pantalla diría «Línea corregida» sin haber tocado
  // nada. Es el mismo hueco que D-05 tapó en la venta.
  if (sinFilas(tocadas)) return { error: NO_ENCONTRADO };

  revalidatePath('/compras/importaciones');
  return { ok: 'Línea corregida' };
}

/** COM-02: quita una línea del detalle (solo en BORRADOR, lo exige la BD). */
export async function eliminarLineaImportacion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = z.coerce.number().int().positive().safeParse(datos.get('id'));

  if (!analisis.success) return { error: 'Línea no válida' };

  const supabase = await crearClienteServidor();
  const { data: borradas, error } = await supabase
    .from('importacion_detalle')
    .delete()
    .eq('id', analisis.data)
    .select('id');

  if (error) return { error: mensajeError(error, 'detalle') };
  if (sinFilas(borradas)) return { error: NO_ENCONTRADO };

  revalidatePath('/compras/importaciones');
  return { ok: 'Línea quitada' };
}

const esquemaConfirmacion = z.object({
  importacion_id: z.coerce.number().int().positive(),
});

/** COM-03: confirma e ingresa a stock (todo o nada, en la base de datos). */
export async function confirmarImportacion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaConfirmacion.safeParse({
    importacion_id: datos.get('importacion_id'),
  });

  if (!analisis.success) {
    return { error: 'Importación no válida' };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('fn_confirmar_importacion', {
    p_importacion_id: analisis.data.importacion_id,
  });

  if (error) return { error: mensajeError(error, 'importación') };

  // Confirmar mueve la importación de una pantalla a la otra: las dos cambian.
  revalidatePath('/compras/importaciones');
  revalidatePath('/compras/confirmadas');
  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  // Los precios de venta pueden haberse publicado en la lista.
  revalidatePath('/ventas/precios');

  // La función devuelve qué pasó con los precios: si había lista en esa moneda
  // y cuántos se publicaron. Es más útil que un mensaje fijo.
  return { ok: typeof data === 'string' && data ? data : 'Importación confirmada' };
}
