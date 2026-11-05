'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';
import { requerirPermiso } from '@/lib/auth';
import { NO_ENCONTRADO, sinFilas } from '@/lib/validacion';

/*
 * Estos datos salen impresos en cada nota de venta y en el traspaso ante
 * Aduanas (ADM-03): un RUT mal escrito circula en papel. Antes solo se exigía
 * la razón social y el resto pasaba sin forma ni largo.
 */
const esquema = z.object({
  razon_social: z.string().trim().min(1, 'La razón social es obligatoria').max(120),
  rut: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.?\d{3})*-[\dkK]$/, 'RUT no válido (ej. 76.123.456-7)')
    .optional(),
  giro: z.string().trim().max(120).optional(),
  direccion: z.string().trim().max(200).optional(),
  ciudad: z.string().trim().max(80).optional(),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+][0-9\s-]{5,24}$/, 'Teléfono no válido: solo números, espacios y guiones')
    .optional(),
  email: z.string().trim().email('Correo no válido').max(120).optional().or(z.literal('')),
});

/** ADM-03: actualiza los datos de la empresa (fila única). */
export async function guardarEmpresa(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  // Era la única acción de administración sin comprobar el permiso. La RLS
  // rechazaba igual, pero en silencio (ver abajo).
  await requerirPermiso('empresa.editar');

  const analisis = esquema.safeParse({
    razon_social: datos.get('razon_social'),
    rut: datos.get('rut') || undefined,
    giro: datos.get('giro') || undefined,
    direccion: datos.get('direccion') || undefined,
    ciudad: datos.get('ciudad') || undefined,
    telefono: datos.get('telefono') || undefined,
    email: datos.get('email') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { data: tocadas, error } = await supabase
    .from('empresa')
    .update({
      razon_social: analisis.data.razon_social,
      rut: analisis.data.rut ? analisis.data.rut.toUpperCase() : null,
      giro: analisis.data.giro ?? null,
      direccion: analisis.data.direccion ?? null,
      ciudad: analisis.data.ciudad ?? null,
      telefono: analisis.data.telefono ?? null,
      email: analisis.data.email || null,
    })
    .eq('id', 1)
    .select('id');

  if (error) return { error: mensajeError(error, 'empresa') };
  // Sin `empresa.editar` la RLS filtraba el UPDATE y PostgREST respondía que
  // todo había salido bien: la pantalla decía «actualizados» y no cambiaba nada.
  if (sinFilas(tocadas)) return { error: NO_ENCONTRADO };

  revalidatePath('/admin/empresa');
  return { ok: 'Datos de la empresa actualizados' };
}
