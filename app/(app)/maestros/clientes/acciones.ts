'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';
import { NO_ENCONTRADO, leerId, sinFilas } from '@/lib/validacion';

const esquema = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(20, 'El código no puede superar 20 caracteres'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  rut: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.?\d{3})*-[\dkK]$/, 'RUT no válido (ej. 76.123.456-7)')
    .optional()
    .or(z.literal('')),
  contacto: z.string().trim().max(80).optional(),
  email: z.string().trim().email('Correo no válido').max(120).optional().or(z.literal('')),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+][0-9\s-]{5,24}$/, 'Teléfono no válido: solo números, espacios y guiones')
    .optional()
    .or(z.literal('')),
  direccion: z.string().trim().max(200).optional(),
  ciudad: z.string().trim().max(80).optional(),
  pais: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,3}$/, 'El país es un código de 2 o 3 letras (CL, PE)'),
  notas: z.string().trim().max(500).optional(),
  // Baja lógica: un cliente con ventas no se borra, se desactiva.
  activo: z.enum(['1', '0']),
});

/** MAE-06: maestro de clientes (compradores mayoristas). */
export async function guardarCliente(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const lectura = leerId(datos.get('id'));
  if ('error' in lectura) return { error: lectura.error };
  const { id } = lectura;

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
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const valores = {
    codigo: analisis.data.codigo.toUpperCase().replace(/\s+/g, ''),
    nombre: analisis.data.nombre,
    rut: analisis.data.rut ? analisis.data.rut.toUpperCase() : null,
    contacto: analisis.data.contacto ?? null,
    email: analisis.data.email || null,
    telefono: analisis.data.telefono || null,
    direccion: analisis.data.direccion ?? null,
    ciudad: analisis.data.ciudad ?? null,
    pais: analisis.data.pais.toUpperCase(),
    notas: analisis.data.notas ?? null,
    activo: analisis.data.activo === '1',
  };

  const supabase = await crearClienteServidor();
  let tocadas: readonly unknown[] | null = null;
  let error: PostgrestError | null = null;
  if (id === null) {
    ({ error } = await supabase.from('cliente').insert(valores));
  } else {
    // PostgREST no da error cuando la RLS filtra un UPDATE, o cuando la fila ya
    // no existe: responde que salió bien con cero filas.
    ({ data: tocadas, error } = await supabase
      .from('cliente')
      .update(valores)
      .eq('id', id)
      .select('id'));
  }

  if (error) return { error: mensajeError(error, 'cliente') };
  if (id !== null && sinFilas(tocadas)) return { error: NO_ENCONTRADO };

  revalidatePath('/maestros/clientes');
  return { ok: id !== null ? 'Cliente actualizado' : 'Cliente creado' };
}
