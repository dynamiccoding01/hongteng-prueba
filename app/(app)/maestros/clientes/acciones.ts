'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  codigo: z.string().trim().min(1, 'El código es obligatorio').max(20),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  rut: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.?\d{3})*-[\dkK]$/, 'RUT no válido (ej. 76.123.456-7)')
    .optional()
    .or(z.literal('')),
  contacto: z.string().trim().optional(),
  email: z.string().trim().email('Correo no válido').optional().or(z.literal('')),
  telefono: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  pais: z.string().trim().min(2, 'Indique el país').max(3),
  notas: z.string().trim().optional(),
});

/** MAE-06: maestro de clientes (compradores mayoristas). */
export async function guardarCliente(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquema.safeParse({
    codigo: datos.get('codigo'),
    nombre: datos.get('nombre'),
    rut: datos.get('rut') || undefined,
    contacto: datos.get('contacto') || undefined,
    email: datos.get('email') || undefined,
    telefono: datos.get('telefono') || undefined,
    direccion: datos.get('direccion') || undefined,
    ciudad: datos.get('ciudad') || undefined,
    pais: datos.get('pais') || 'CL',
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    codigo: analisis.data.codigo.toUpperCase(),
    nombre: analisis.data.nombre,
    rut: analisis.data.rut ? analisis.data.rut.toUpperCase() : null,
    contacto: analisis.data.contacto ?? null,
    email: analisis.data.email || null,
    telefono: analisis.data.telefono ?? null,
    direccion: analisis.data.direccion ?? null,
    ciudad: analisis.data.ciudad ?? null,
    pais: analisis.data.pais.toUpperCase(),
    notas: analisis.data.notas ?? null,
  };

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase.from('cliente').update(valores).eq('id', Number(id))
    : await supabase.from('cliente').insert(valores);

  if (error) return { error: mensajeError(error, 'cliente') };

  revalidatePath('/maestros/clientes');
  return { ok: id ? 'Cliente actualizado' : 'Cliente creado' };
}
