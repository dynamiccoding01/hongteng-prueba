'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  stock_minimo: z.coerce.number().min(0, 'El mínimo no puede ser negativo'),
});

/** INV-05: fija el stock mínimo (en cajas) de una variante. 0 = sin alerta. */
export async function fijarStockMinimo(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquema.safeParse({
    variante_id: datos.get('variante_id'),
    stock_minimo: datos.get('stock_minimo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('producto_variante')
    .update({ stock_minimo: analisis.data.stock_minimo })
    .eq('id', analisis.data.variante_id);

  if (error) return { error: mensajeError(error, 'stock mínimo') };

  revalidatePath('/inventario/alertas');
  return { ok: 'Stock mínimo actualizado' };
}
