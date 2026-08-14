'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaCabecera = z.object({
  proveedor_id: z.coerce.number().int().positive('Seleccione el proveedor'),
  documento_aduana: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  notas: z.string().trim().optional(),
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
    cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
    costo_caja: z.coerce.number().min(0, 'Costo no válido').optional(),
    precio_venta_caja: z.coerce.number().min(0, 'Precio de venta no válido').optional(),
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
