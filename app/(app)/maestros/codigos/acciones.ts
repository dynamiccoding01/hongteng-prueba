'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  variante_id: z.coerce.number().int().positive(),
  codigo_barras: z.string().trim().optional(),
  sku_interno: z.string().trim().optional(),
});

/** INV-08: asigna el código de barras / SKU interno de un empaque existente. */
export async function actualizarCodigos(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquema.safeParse({
    variante_id: datos.get('variante_id'),
    codigo_barras: datos.get('codigo_barras') || undefined,
    sku_interno: datos.get('sku_interno') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('producto_variante')
    .update({
      codigo_barras: analisis.data.codigo_barras ?? null,
      sku_interno: analisis.data.sku_interno ?? null,
    })
    .eq('id', analisis.data.variante_id);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ese código de barras o SKU ya está asignado a otro empaque' };
    }
    return { error: mensajeError(error, 'código') };
  }

  revalidatePath('/maestros/codigos');
  return { ok: 'Código actualizado' };
}
