'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaCabecera = z.object({
  bodega_id: z.coerce.number().int().positive('Seleccione la bodega'),
  fecha: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

/** INV-06: crea una toma de inventario en estado BORRADOR. */
export async function crearToma(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.safeParse({
    bodega_id: datos.get('bodega_id'),
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('toma_inventario').insert({
    bodega_id: analisis.data.bodega_id,
    fecha: analisis.data.fecha || undefined,
    notas: analisis.data.notas ?? null,
  });

  if (error) return { error: mensajeError(error, 'toma de inventario') };

  revalidatePath('/inventario/toma');
  return { ok: 'Toma de inventario creada como borrador' };
}

const esquemaConteo = z.object({
  toma_id: z.coerce.number().int().positive(),
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_id: z.coerce.number().int().positive('Seleccione la zona'),
  cajas_contadas: z.coerce.number().min(0, 'Las cajas no pueden ser negativas'),
});

/** INV-06: registra el conteo físico de un artículo en una zona. */
export async function agregarConteo(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaConteo.safeParse({
    toma_id: datos.get('toma_id'),
    variante_id: datos.get('variante_id'),
    zona_id: datos.get('zona_id'),
    cajas_contadas: datos.get('cajas_contadas'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('toma_inventario_detalle')
    .upsert(analisis.data, { onConflict: 'toma_id,variante_id,zona_id' });

  if (error) return { error: mensajeError(error, 'conteo') };

  revalidatePath('/inventario/toma');
  return { ok: 'Conteo registrado' };
}

const esquemaAplicacion = z.object({
  toma_id: z.coerce.number().int().positive(),
});

/** INV-06: aplica la toma — genera un ajuste por cada diferencia y la sella. */
export async function aplicarToma(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaAplicacion.safeParse({ toma_id: datos.get('toma_id') });

  if (!analisis.success) {
    return { error: 'Toma no válida' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_aplicar_toma_inventario', {
    p_toma_id: analisis.data.toma_id,
  });

  if (error) return { error: mensajeError(error, 'toma de inventario') };

  revalidatePath('/inventario/toma');
  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  return { ok: 'Toma aplicada: diferencias ajustadas' };
}
