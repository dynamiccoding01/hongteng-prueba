'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  codigo: z.string().trim().min(1, 'El código es obligatorio').max(20),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  nombre_zh: z.string().trim().optional(),
  pais: z.string().trim().min(2, 'Indique el país').max(3),
  contacto: z.string().trim().optional(),
  email: z.string().trim().email('Correo no válido').optional().or(z.literal('')),
  telefono: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
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
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    codigo: analisis.data.codigo.toUpperCase(),
    nombre: analisis.data.nombre,
    nombre_zh: analisis.data.nombre_zh ?? null,
    pais: analisis.data.pais.toUpperCase(),
    contacto: analisis.data.contacto ?? null,
    email: analisis.data.email || null,
    telefono: analisis.data.telefono ?? null,
    direccion: analisis.data.direccion ?? null,
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('proveedor').update(valores).eq('id', Number(id))
    : await supabase.from('proveedor').insert(valores);

  if (error) return { error: mensajeError(error, 'proveedor') };

  revalidatePath('/maestros/proveedores');
  return { ok: id ? 'Proveedor actualizado' : 'Proveedor creado' };
}
