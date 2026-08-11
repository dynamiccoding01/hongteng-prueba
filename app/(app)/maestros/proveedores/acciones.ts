'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede superar 20 caracteres'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  nombre_zh: z.string().trim().max(120).optional(),
  pais: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,3}$/, 'El país es un código de 2 o 3 letras (CN, CL)'),
  contacto: z.string().trim().max(80).optional(),
  email: z.string().trim().email('Correo no válido').max(120).optional().or(z.literal('')),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+][0-9\s-]{5,24}$/, 'Teléfono no válido: solo números, espacios y guiones')
    .optional()
    .or(z.literal('')),
  direccion: z.string().trim().max(200).optional(),
  // Baja lógica: un proveedor con historial no se borra, se desactiva.
  activo: z.enum(['1', '0']),
});

/** MAE-05: maestro de proveedores (fábricas en China). */
export async function guardarProveedor(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquema.safeParse({
    codigo: datos.get('codigo'),
    nombre: datos.get('nombre'),
    nombre_zh: datos.get('nombre_zh') || undefined,
    pais: datos.get('pais') || 'CN',
    contacto: datos.get('contacto') || undefined,
    email: datos.get('email') || undefined,
    telefono: datos.get('telefono') || undefined,
    direccion: datos.get('direccion') || undefined,
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    codigo: analisis.data.codigo.toUpperCase().replace(/\s+/g, ''),
    nombre: analisis.data.nombre,
    nombre_zh: analisis.data.nombre_zh ?? null,
    pais: analisis.data.pais.toUpperCase(),
    contacto: analisis.data.contacto ?? null,
    email: analisis.data.email || null,
    telefono: analisis.data.telefono || null,
    direccion: analisis.data.direccion ?? null,
    activo: analisis.data.activo === '1',
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('proveedor').update(valores).eq('id', Number(id))
    : await supabase.from('proveedor').insert(valores);

  if (error) return { error: mensajeError(error, 'proveedor') };

  revalidatePath('/maestros/proveedores');
  return { ok: id ? 'Proveedor actualizado' : 'Proveedor creado' };
}
