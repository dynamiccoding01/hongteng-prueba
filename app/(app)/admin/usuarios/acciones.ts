'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { AVISO_SIN_CLAVE, crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerUsuario, registrarEnBitacora, requerirPermiso } from '@/lib/auth';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

/**
 * ADM-01 · Alta y mantención de usuarios.
 *
 * `usuario.id` es una FK contra `auth.users`: no hay usuario del sistema sin
 * cuenta de autenticación detrás. Por eso estas acciones combinan dos clientes:
 *
 * - el **de sesión** para todo lo que toque la tabla `usuario`, de modo que RLS
 *   siga siendo la autorización de verdad. Es lo que impide que un
 *   Administrador se fabrique un Superadmin;
 * - el **de administración** (clave secreta, omite RLS) solo para `auth.users`,
 *   que es lo único que no se puede hacer de otra forma.
 */

const MIN_CLAVE = 8;

const esquemaCrear = z.object({
  nombre: z.string().trim().min(1, 'Ingrese el nombre de la persona').max(80),
  email: z.string().trim().toLowerCase().email('El correo no es válido'),
  rol_id: z.coerce.number().int().positive('Seleccione un rol'),
  clave: z.string().min(MIN_CLAVE, `La contraseña debe tener al menos ${MIN_CLAVE} caracteres`),
});

/**
 * Crea la cuenta de acceso y deja al usuario listo para entrar.
 *
 * El administrador fija una contraseña inicial y se la entrega a la persona; no
 * se envía correo, porque la operación en bodega no depende de que el envío de
 * correos esté configurado.
 */
export async function crearUsuario(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirPermiso('usuario.crear');

  const analisis = esquemaCrear.safeParse({
    nombre: datos.get('nombre'),
    email: datos.get('email'),
    rol_id: datos.get('rol_id'),
    clave: datos.get('clave'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { nombre, email, rol_id, clave } = analisis.data;
  const supabase = await crearClienteServidor();

  // El rol se valida con el cliente de sesión: RLS no le muestra los roles
  // protegidos a un Administrador, así que si no lo ve, no puede asignarlo.
  const { data: rol } = await supabase.from('rol').select('id, nombre').eq('id', rol_id).single();
  if (!rol) return { error: 'El rol indicado no existe o no está disponible para usted' };

  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch {
    return { error: AVISO_SIN_CLAVE };
  }

  // `email_confirm` evita el correo de verificación: la persona entra de
  // inmediato con la contraseña que le entregaron.
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (errorAuth || !creado.user) {
    const detalle = errorAuth?.message ?? '';
    if (detalle.includes('already been registered') || detalle.includes('already exists')) {
      return { error: 'Ya existe un usuario con ese correo' };
    }
    return { error: `No se pudo crear la cuenta: ${detalle}` };
  }

  // El trigger tr_auth_user_creado ya insertó la fila en `usuario` con el rol
  // por defecto (Consulta); aquí se le pone el rol elegido. Va con el cliente de
  // sesión a propósito: RLS revalida que ese rol sea asignable.
  const { error: errorRol } = await supabase
    .from('usuario')
    .update({ rol_id, nombre })
    .eq('id', creado.user.id);

  if (errorRol) {
    // Sin rol correcto la cuenta queda a medias: se deshace para no dejar un
    // acceso huérfano que nadie sabe de dónde salió.
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: `No se pudo asignar el rol: ${mensajeError(errorRol, 'usuario')}` };
  }

  await registrarEnBitacora('INSERT', 'admin', `Alta de usuario ${email} con rol ${rol.nombre}`);

  revalidatePath('/admin/usuarios');
  return { ok: `Usuario «${nombre}» creado. Entrégale la contraseña para que ingrese.` };
}

const esquemaEditar = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  email: z.string().trim().toLowerCase().email('El correo no es válido'),
  rol_id: z.coerce.number().int().positive('Seleccione un rol'),
  activo: z.enum(['1', '0']),
});

/** ADM-01: cambia nombre, correo, rol o estado de un usuario. */
export async function actualizarUsuario(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirPermiso('usuario.editar');

  const analisis = esquemaEditar.safeParse({
    id: datos.get('id'),
    nombre: datos.get('nombre'),
    email: datos.get('email'),
    rol_id: datos.get('rol_id'),
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, nombre, email, rol_id, activo } = analisis.data;
  const supabase = await crearClienteServidor();

  const { data: previo, error: errorPrevio } = await supabase
    .from('usuario')
    .select('email, rol_id')
    .eq('id', id)
    .single();

  if (errorPrevio) return { error: mensajeError(errorPrevio, 'usuario') };

  // Nadie se deja a sí mismo fuera del sistema: ni desactivándose ni bajándose
  // de rol. Si no, el último administrador puede dejar el sistema sin quien lo
  // administre y hay que entrar por la base de datos a arreglarlo.
  const actual = await obtenerUsuario();
  if (actual?.id === id) {
    if (activo === '0') return { error: 'No puede desactivar su propia cuenta' };
    if (previo.rol_id !== rol_id) {
      return { error: 'No puede cambiarse el rol a usted mismo. Pídaselo a otro administrador.' };
    }
  }

  // El correo es la credencial de acceso: cambiarlo en la tabla sin cambiarlo en
  // auth.users dejaría a la persona entrando con el correo viejo.
  const cambioCorreo = previo.email !== email;
  if (cambioCorreo) {
    let admin: ReturnType<typeof crearClienteAdmin>;
    try {
      admin = crearClienteAdmin();
    } catch {
      return { error: AVISO_SIN_CLAVE };
    }

    const { error: errorAuth } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });

    if (errorAuth) {
      const detalle = errorAuth.message;
      if (detalle.includes('already been registered') || detalle.includes('already exists')) {
        return { error: 'Ya existe otro usuario con ese correo' };
      }
      return { error: `No se pudo cambiar el correo de acceso: ${detalle}` };
    }
  }

  const { error } = await supabase
    .from('usuario')
    .update({ nombre, email, rol_id, activo: activo === '1' })
    .eq('id', id);

  if (error) {
    // La tabla manda: si no se pudo guardar, se devuelve el correo de acceso a
    // como estaba, para que ambos lados no queden discrepando.
    if (cambioCorreo) {
      try {
        await crearClienteAdmin().auth.admin.updateUserById(id, {
          email: previo.email,
          email_confirm: true,
        });
      } catch {
        return {
          error: `No se pudo guardar y el correo de acceso quedó en ${email}. Avise al área de TI.`,
        };
      }
    }
    return { error: mensajeError(error, 'usuario') };
  }

  revalidatePath('/admin/usuarios');
  return { ok: 'Usuario actualizado' };
}

const esquemaClave = z.object({
  id: z.string().uuid(),
  clave: z.string().min(MIN_CLAVE, `La contraseña debe tener al menos ${MIN_CLAVE} caracteres`),
});

/** ADM-01: el administrador le fija una contraseña nueva a alguien que la perdió. */
export async function restablecerContrasena(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirPermiso('usuario.editar');

  const analisis = esquemaClave.safeParse({
    id: datos.get('id'),
    clave: datos.get('clave'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, clave } = analisis.data;

  // El cliente de administración omite RLS, así que la comprobación de que este
  // usuario es visible para quien opera se hace explícitamente: si RLS no se lo
  // muestra (por ejemplo, un Superadmin visto por un Administrador), no puede
  // cambiarle la contraseña.
  const supabase = await crearClienteServidor();
  const { data: objetivo } = await supabase
    .from('usuario')
    .select('id, email')
    .eq('id', id)
    .single();

  if (!objetivo) return { error: 'El usuario no existe o no está disponible para usted' };

  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch {
    return { error: AVISO_SIN_CLAVE };
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
  if (error) return { error: `No se pudo cambiar la contraseña: ${error.message}` };

  await registrarEnBitacora('UPDATE', 'admin', `Contraseña restablecida a ${objetivo.email}`);

  revalidatePath('/admin/usuarios');
  return { ok: 'Contraseña actualizada. Entrégasela a la persona.' };
}
