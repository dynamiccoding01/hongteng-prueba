'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

/**
 * Validacion en el borde. La base de datos vuelve a validar con NOT NULL,
 * UNIQUE y CHECK: esta capa da mensajes claros, no reemplaza a aquella.
 */
const esquemaCategoria = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede superar 20 caracteres')
    .regex(/^[A-Z0-9_]+$/, 'Use solo mayúsculas, números y guion bajo'),
  nombre_es: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  nombre_zh: z.string().trim().max(60).optional(),
  // Unidad sugerida al dar de alta un artículo de esta categoría (MAE-07).
  unidad_medida_default_id: z.coerce.number().int().positive('Seleccione la unidad de medida'),
  // Baja lógica: una categoría con productos no se borra, se desactiva.
  activo: z.enum(['1', '0']),
});

export async function guardarCategoria(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquemaCategoria.safeParse({
    codigo: datos.get('codigo'),
    nombre_es: datos.get('nombre_es'),
    nombre_zh: datos.get('nombre_zh') || undefined,
    unidad_medida_default_id: datos.get('unidad_medida_default_id'),
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const valores = {
    codigo: analisis.data.codigo,
    nombre_es: analisis.data.nombre_es,
    nombre_zh: analisis.data.nombre_zh ?? null,
    unidad_medida_default_id: analisis.data.unidad_medida_default_id,
    activo: analisis.data.activo === '1',
  };

  const { error } = id
    ? await supabase.from('categoria').update(valores).eq('id', Number(id))
    : await supabase.from('categoria').insert(valores);

  if (error) return { error: mensajeError(error, 'categoría') };

  revalidatePath('/maestros/categorias');
  revalidatePath('/maestros/productos');
  return { ok: id ? 'Categoría actualizada' : 'Categoría creada' };
}
