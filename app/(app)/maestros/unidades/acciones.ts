'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaUnidad = z.object({
  codigo: z.string().trim().min(1, 'El código es obligatorio').max(20),
  nombre_es: z.string().trim().min(1, 'El nombre es obligatorio'),
  nombre_zh: z.string().trim().optional(),
  // Baja logica: una unidad en uso no se borra, se desactiva.
  activo: z.enum(['1', '0']),
});

/** MAE-07: unidades de medida. Antes eran un enum fijo en la base de datos. */
export async function guardarUnidad(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquemaUnidad.safeParse({
    codigo: datos.get('codigo'),
    nombre_es: datos.get('nombre_es'),
    nombre_zh: datos.get('nombre_zh') || undefined,
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    // El código se muestra en tablas y reportes: siempre mayúsculas y sin
    // espacios, para que 'par ' y 'PAR' no convivan como unidades distintas.
    codigo: analisis.data.codigo.toUpperCase().replace(/\s+/g, ''),
    nombre_es: analisis.data.nombre_es,
    nombre_zh: analisis.data.nombre_zh ?? null,
    activo: analisis.data.activo === '1',
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('unidad_medida').update(valores).eq('id', Number(id))
    : await supabase.from('unidad_medida').insert(valores);

  if (error) return { error: mensajeError(error, 'unidad de medida') };

  revalidatePath('/maestros/unidades');
  // El alta de productos elige de esta lista.
  revalidatePath('/maestros/productos');
  revalidatePath('/maestros/categorias');
  return { ok: id ? 'Unidad de medida actualizada' : 'Unidad de medida creada' };
}
