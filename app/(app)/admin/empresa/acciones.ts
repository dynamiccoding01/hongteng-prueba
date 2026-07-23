'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  razon_social: z.string().trim().min(1, 'La razón social es obligatoria'),
  rut: z.string().trim().optional(),
  giro: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  email: z.string().trim().email('Correo no válido').optional().or(z.literal('')),
});

/** ADM-03: actualiza los datos de la empresa (fila única). */
export async function guardarEmpresa(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
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
  const { error } = await supabase
    .from('empresa')
    .update({
      razon_social: analisis.data.razon_social,
      rut: analisis.data.rut ?? null,
      giro: analisis.data.giro ?? null,
      direccion: analisis.data.direccion ?? null,
      ciudad: analisis.data.ciudad ?? null,
      telefono: analisis.data.telefono ?? null,
      email: analisis.data.email || null,
    })
    .eq('id', 1);

  if (error) return { error: mensajeError(error, 'empresa') };

  revalidatePath('/admin/empresa');
  return { ok: 'Datos de la empresa actualizados' };
}
