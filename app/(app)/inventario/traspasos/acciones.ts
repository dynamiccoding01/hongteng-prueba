'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_origen: z.coerce.number().int().positive('Seleccione la zona de origen'),
  zona_destino: z.coerce.number().int().positive('Seleccione la zona de destino'),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  motivo: z.string().trim().optional(),
});

/** INV-07: traspasa cajas de una zona a otra (dentro de la misma u otra bodega). */
export async function traspasarStock(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquema.safeParse({
    variante_id: datos.get('variante_id'),
    zona_origen: datos.get('zona_origen'),
    zona_destino: datos.get('zona_destino'),
    cajas: datos.get('cajas'),
    motivo: datos.get('motivo') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  if (analisis.data.zona_origen === analisis.data.zona_destino) {
    return { error: 'La zona de origen y destino no pueden ser la misma' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_traspasar', {
    p_variante_id: analisis.data.variante_id,
    p_zona_origen: analisis.data.zona_origen,
    p_zona_destino: analisis.data.zona_destino,
    p_cajas: analisis.data.cajas,
    p_motivo: analisis.data.motivo,
  });

  if (error) return { error: mensajeError(error, 'traspaso') };

  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  return { ok: 'Traspaso registrado' };
}
