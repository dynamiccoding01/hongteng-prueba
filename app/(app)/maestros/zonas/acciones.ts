'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

// `activo` en ambos esquemas: baja lógica. Una bodega o una zona con
// existencias no se borra, se desactiva.
const esquemaBodega = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(10, 'El código no puede superar 10 caracteres'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  direccion: z.string().trim().max(200).optional(),
  activo: z.enum(['1', '0']),
  // `color` no está aquí a propósito: lo asigna la base al insertar y no se
  // edita (0017_bodega_color_automatico.sql).
});

const esquemaZona = z.object({
  bodega_id: z.coerce.number().int().positive('Seleccione la bodega'),
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede superar 20 caracteres'),
  descripcion: z.string().trim().max(200).optional(),
  activo: z.enum(['1', '0']),
});

export async function guardarBodega(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');
  const analisis = esquemaBodega.safeParse({
    codigo: datos.get('codigo'),
    nombre: datos.get('nombre'),
    direccion: datos.get('direccion') || undefined,
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    codigo: analisis.data.codigo.toUpperCase().replace(/\s+/g, ''),
    nombre: analisis.data.nombre,
    direccion: analisis.data.direccion ?? null,
    activo: analisis.data.activo === '1',
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('bodega').update(valores).eq('id', Number(id))
    : await supabase.from('bodega').insert(valores);

  if (error) return { error: mensajeError(error, 'bodega') };

  revalidatePath('/maestros/zonas');
  return { ok: id ? 'Bodega actualizada' : 'Bodega creada' };
}

/**
 * MAE-04: normaliza las ubicaciones que en BODEGA.xls eran texto libre
 * ('1-4', 'M2-4', '3-8').
 */
export async function guardarZona(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');
  const analisis = esquemaZona.safeParse({
    bodega_id: datos.get('bodega_id'),
    codigo: datos.get('codigo'),
    descripcion: datos.get('descripcion') || undefined,
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    bodega_id: analisis.data.bodega_id,
    // Las zonas se guardan siempre en mayúsculas y sin espacios, igual que el
    // parser de la planilla: 'M2-4 ' y 'm2-4' son la misma ubicación.
    codigo: analisis.data.codigo.toUpperCase().replace(/\s+/g, ''),
    descripcion: analisis.data.descripcion ?? null,
    activo: analisis.data.activo === '1',
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('zona').update(valores).eq('id', Number(id))
    : await supabase.from('zona').insert(valores);

  if (error) return { error: mensajeError(error, 'zona') };

  revalidatePath('/maestros/zonas');
  return { ok: id ? 'Zona actualizada' : 'Zona creada' };
}
