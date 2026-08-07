'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirPermiso } from '@/lib/auth';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

/**
 * ADM-01: edición de la matriz rol → rol_permiso ← permiso.
 *
 * La autorización de verdad la aplica RLS: `rol_permiso_escritura` exige
 * `rol.editar` y, para los roles protegidos (Superadmin), ser Superadmin. Aquí
 * solo se exige el permiso para dar un mensaje claro; si alguien saltara esta
 * comprobación, la base rechaza igual.
 */

const esquemaAlternar = z.object({
  rolId: z.number().int().positive(),
  permisoId: z.number().int().positive(),
  activar: z.boolean(),
});

export async function alternarPermiso(
  rolId: number,
  permisoId: number,
  activar: boolean,
): Promise<EstadoFormulario> {
  await requerirPermiso('rol.editar');

  const analisis = esquemaAlternar.safeParse({ rolId, permisoId, activar });
  if (!analisis.success) return { error: 'Datos no válidos' };

  const supabase = await crearClienteServidor();

  if (activar) {
    const { error } = await supabase
      .from('rol_permiso')
      .insert({ rol_id: rolId, permiso_id: permisoId });
    // 23505 = ya existía: para un alternar es el resultado deseado, no un error.
    if (error && error.code !== '23505') return { error: mensajeError(error, 'permiso') };
  } else {
    const { error } = await supabase
      .from('rol_permiso')
      .delete()
      .eq('rol_id', rolId)
      .eq('permiso_id', permisoId);
    if (error) return { error: mensajeError(error, 'permiso') };
  }

  revalidatePath('/admin/roles');
  return { ok: activar ? 'Permiso agregado' : 'Permiso quitado' };
}

const esquemaCrearRol = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingrese un nombre para el rol')
    .max(40, 'El nombre es demasiado largo'),
  descripcion: z.string().trim().max(200).nullish(),
});

export async function crearRol(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirPermiso('rol.editar');

  const analisis = esquemaCrearRol.safeParse({
    nombre: datos.get('nombre'),
    descripcion: datos.get('descripcion'),
  });
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  // Un rol creado desde la interfaz nunca es protegido ni de acceso total: esos
  // son privilegio de Superadmin y RLS (with check) lo rechazaría de todos modos.
  const { error } = await supabase.from('rol').insert({
    nombre: analisis.data.nombre,
    descripcion: analisis.data.descripcion ?? null,
  });
  if (error) return { error: mensajeError(error, 'rol') };

  revalidatePath('/admin/roles');
  return { ok: `Rol «${analisis.data.nombre}» creado` };
}

const esquemaEditarRol = esquemaCrearRol.extend({
  id: z.coerce.number().int().positive(),
  activo: z.enum(['1', '0']),
});

/**
 * ADM-01: corregir el nombre o la descripción de un rol, o darlo de baja.
 *
 * Nombrar mal un rol es fácil y hasta ahora no había cómo arreglarlo salvo
 * creando otro. Los roles protegidos (Superadmin) no llegan aquí: RLS no se los
 * muestra a un Administrador, y su política de escritura los excluye.
 */
export async function editarRol(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirPermiso('rol.editar');

  const analisis = esquemaEditarRol.safeParse({
    id: datos.get('id'),
    nombre: datos.get('nombre'),
    descripcion: datos.get('descripcion'),
    activo: datos.get('activo'),
  });
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, nombre, descripcion, activo } = analisis.data;
  const supabase = await crearClienteServidor();

  // Un rol sin usuarios se puede desactivar sin más; con usuarios dentro, no:
  // `usuario.rol_id` es obligatorio y quedarían con un perfil inhabilitado.
  if (activo === '0') {
    const { count, error: errorConteo } = await supabase
      .from('usuario')
      .select('id', { count: 'exact', head: true })
      .eq('rol_id', id);

    if (errorConteo) return { error: mensajeError(errorConteo, 'rol') };

    if ((count ?? 0) > 0) {
      return {
        error: `No se puede desactivar: ${count} usuario(s) tienen este rol. Cámbieles el rol primero.`,
      };
    }
  }

  const { error } = await supabase
    .from('rol')
    .update({ nombre, descripcion: descripcion ?? null, activo: activo === '1' })
    .eq('id', id);

  if (error) return { error: mensajeError(error, 'rol') };

  revalidatePath('/admin/roles');
  // El nombre del rol se muestra en la lista de usuarios.
  revalidatePath('/admin/usuarios');
  return { ok: `Rol «${nombre}» actualizado` };
}
