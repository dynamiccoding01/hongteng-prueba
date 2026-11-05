'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirPermiso } from '@/lib/auth';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';
import { NO_ENCONTRADO, sinFilas } from '@/lib/validacion';

/**
 * El rol con el que nace todo usuario nuevo. `fn_crear_usuario_desde_auth`
 * (0002) lo busca **por nombre** al crear la cuenta: renombrarlo o darlo de
 * baja hace fallar todas las altas de usuario con un «Database error creating
 * new user» que no dice nada a nadie.
 */
const ROL_POR_DEFECTO = 'Consulta';

/**
 * Permisos que nadie se puede quitar a sí mismo. Es la misma regla que
 * `actualizarUsuario` aplica al rol y al estado: quitarle `rol.editar` al rol
 * propio deja a esa persona —y, si es el último administrador, al sistema
 * entero— sin forma de deshacerlo desde la pantalla.
 */
const PERMISOS_DE_RESCATE = new Set(['rol.editar']);

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
  const usuario = await requerirPermiso('rol.editar');

  // Los argumentos llegan de un componente de cliente: se usan los validados,
  // no los crudos.
  const analisis = esquemaAlternar.safeParse({ rolId, permisoId, activar });
  if (!analisis.success) return { error: 'Datos no válidos' };
  const datos = analisis.data;

  const supabase = await crearClienteServidor();

  if (!datos.activar) {
    const [{ data: propio }, { data: permiso }] = await Promise.all([
      supabase.from('usuario').select('rol_id').eq('id', usuario.id).maybeSingle(),
      supabase.from('permiso').select('codigo').eq('id', datos.permisoId).maybeSingle(),
    ]);

    if (propio?.rol_id === datos.rolId && permiso && PERMISOS_DE_RESCATE.has(permiso.codigo)) {
      return {
        error: `No puede quitarle «${permiso.codigo}» a su propio rol: se quedaría sin poder deshacerlo. Pídaselo a otro administrador.`,
      };
    }
  }

  if (datos.activar) {
    const { error } = await supabase
      .from('rol_permiso')
      .insert({ rol_id: datos.rolId, permiso_id: datos.permisoId });
    // 23505 = ya existía: para un alternar es el resultado deseado, no un error.
    if (error && error.code !== '23505') return { error: mensajeError(error, 'permiso') };
  } else {
    const { error } = await supabase
      .from('rol_permiso')
      .delete()
      .eq('rol_id', datos.rolId)
      .eq('permiso_id', datos.permisoId);
    if (error) return { error: mensajeError(error, 'permiso') };
  }

  revalidatePath('/admin/roles');
  return { ok: datos.activar ? 'Permiso agregado' : 'Permiso quitado' };
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
  /*
   * VEN-07: tope de descuento por linea. Vacio significa «sin tope», que no es
   * lo mismo que 0 —un rol con tope 0 no puede rebajar nada— y por eso el campo
   * distingue la cadena vacia del cero en vez de tratar los dos como falta.
   */
  descuento_maximo: z.coerce
    .number({ message: 'El tope de descuento tiene que ser un número entre 0 y 100' })
    .min(0, 'El tope va entre 0 y 100')
    .max(100, 'El tope va entre 0 y 100')
    .optional(),
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
  const operador = await requerirPermiso('rol.editar');

  const crudoTope = datos.get('descuento_maximo');
  const analisis = esquemaEditarRol.safeParse({
    id: datos.get('id'),
    nombre: datos.get('nombre'),
    descripcion: datos.get('descripcion'),
    activo: datos.get('activo'),
    descuento_maximo:
      typeof crudoTope === 'string' && crudoTope.trim() !== '' ? crudoTope : undefined,
  });
  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, nombre, descripcion, activo, descuento_maximo } = analisis.data;
  const supabase = await crearClienteServidor();

  const { data: previo } = await supabase.from('rol').select('nombre').eq('id', id).maybeSingle();
  if (!previo) return { error: NO_ENCONTRADO };

  if (previo.nombre === ROL_POR_DEFECTO && (nombre !== ROL_POR_DEFECTO || activo === '0')) {
    return {
      error: `«${ROL_POR_DEFECTO}» es el rol con el que nace todo usuario nuevo: no se renombra ni se desactiva. Edite sus permisos si necesita cambiar lo que puede hacer.`,
    };
  }

  // Un rol sin usuarios se puede desactivar sin más; con usuarios dentro, no:
  // `usuario.rol_id` es obligatorio y quedarían con un perfil inhabilitado.
  if (activo === '0') {
    /*
     * El conteo pasa por la RLS de `usuario`: sin `usuario.ver` solo se ve la
     * fila propia, el conteo salía 0 y el rol se desactivaba con gente dentro.
     * Sin ese permiso no hay forma honesta de saberlo, así que no se adivina.
     */
    if (!operador.permisos.has('usuario.ver')) {
      return {
        error: 'Para desactivar un rol hay que poder ver a los usuarios (permiso usuario.ver)',
      };
    }

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

  const { data: tocadas, error } = await supabase
    .from('rol')
    .update({
      nombre,
      descripcion: descripcion ?? null,
      activo: activo === '1',
      descuento_maximo: descuento_maximo ?? null,
    })
    .eq('id', id)
    .select('id');

  if (error) return { error: mensajeError(error, 'rol') };
  if (sinFilas(tocadas)) return { error: NO_ENCONTRADO };

  revalidatePath('/admin/roles');
  // El nombre del rol se muestra en la lista de usuarios.
  revalidatePath('/admin/usuarios');
  return { ok: `Rol «${nombre}» actualizado` };
}
