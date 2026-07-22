'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaCabecera = z.object({
  proveedor_id: z.coerce.number().int().positive('Seleccione el proveedor'),
  moneda_id: z.coerce.number().int().positive('Seleccione la moneda'),
  tipo_cambio: z.coerce.number().positive('Tipo de cambio no válido').optional(),
  documento_aduana: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

/** COM-01: crea la cabecera de una importación en estado BORRADOR. */
export async function crearImportacion(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.safeParse({
    proveedor_id: datos.get('proveedor_id'),
    moneda_id: datos.get('moneda_id'),
    tipo_cambio: datos.get('tipo_cambio') || undefined,
    documento_aduana: datos.get('documento_aduana') || undefined,
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('importacion').insert({
    proveedor_id: analisis.data.proveedor_id,
    moneda_id: analisis.data.moneda_id,
    tipo_cambio: analisis.data.tipo_cambio ?? null,
    documento_aduana: analisis.data.documento_aduana ?? null,
    fecha: analisis.data.fecha || undefined,
    notas: analisis.data.notas ?? null,
  });

  if (error) return { error: mensajeError(error, 'importación') };

  revalidatePath('/compras/importaciones');
  return { ok: 'Importación creada como borrador' };
}

const esquemaDetalle = z.object({
  importacion_id: z.coerce.number().int().positive(),
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_id: z.coerce.number().int().positive('Seleccione la zona de destino'),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  costo_caja: z.coerce.number().min(0, 'Costo no válido').optional(),
});

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
  const { error } = await supabase.rpc('fn_confirmar_importacion', {
    p_importacion_id: analisis.data.importacion_id,
  });

  if (error) return { error: mensajeError(error, 'importación') };

  revalidatePath('/compras/importaciones');
  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  return { ok: 'Importación confirmada: mercadería ingresada a stock' };
}
