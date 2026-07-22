'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { obtenerUsuario } from '@/lib/auth';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  id: z.string().uuid(),
  rol_id: z.coerce.number().int().positive('Seleccione un rol'),
  activo: z.coerce.boolean(),
});

/**
 * ADM-01: cambia el rol o el estado de un usuario.
 * Los usuarios se crean en Supabase Auth, no aquí: este sistema no maneja
 * contraseñas.
 */
export async function actualizarUsuario(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquema.safeParse({
    id: datos.get('id'),
    rol_id: datos.get('rol_id'),
    activo: datos.get('activo') === 'on',
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  // Un administrador no puede quitarse a sí mismo el acceso y dejar el sistema
  // sin quien lo administre.
  const actual = await obtenerUsuario();
  if (actual?.id === analisis.data.id && !analisis.data.activo) {
    return { error: 'No puede desactivar su propia cuenta' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('usuario')
    .update({ rol_id: analisis.data.rol_id, activo: analisis.data.activo })
    .eq('id', analisis.data.id);

  if (error) return { error: mensajeError(error, 'usuario') };

  revalidatePath('/admin/usuarios');
  return { ok: 'Usuario actualizado' };
}
