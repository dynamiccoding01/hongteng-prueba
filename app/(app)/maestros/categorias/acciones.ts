'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

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
  nombre_es: z.string().trim().min(1, 'El nombre es obligatorio'),
  nombre_zh: z.string().trim().optional(),
  unidad_medida_default: z.enum(['PAR', 'PIEZA', 'JUEGO']),
});

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

export async function guardarCategoria(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquemaCategoria.safeParse({
    codigo: datos.get('codigo'),
    nombre_es: datos.get('nombre_es'),
    nombre_zh: datos.get('nombre_zh') || undefined,
    unidad_medida_default: datos.get('unidad_medida_default'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const valores = {
    ...analisis.data,
    nombre_zh: analisis.data.nombre_zh ?? null,
  };

  const { error } = id
    ? await supabase.from('categoria').update(valores).eq('id', Number(id))
    : await supabase.from('categoria').insert(valores);

  if (error) {
    // 23505 = violacion de unicidad. 42501 = RLS lo rechazo.
    if (error.code === '23505') return { error: `Ya existe una categoría con ese código` };
    if (error.code === '42501') return { error: 'Su rol no tiene permiso para esta operación' };
    return { error: error.message };
  }

  revalidatePath('/maestros/categorias');
  return { ok: id ? 'Categoría actualizada' : 'Categoría creada' };
}

export async function cambiarEstadoCategoria(id: number, activo: boolean) {
  const supabase = await crearClienteServidor();
  // Baja logica: nunca DELETE sobre datos con historial.
  const { error } = await supabase.from('categoria').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/maestros/categorias');
}
