import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  permisos: Set<string>;
}

/**
 * Usuario autenticado con su rol y sus permisos resueltos.
 * `cache` evita repetir la consulta dentro del mismo renderizado.
 */
export const obtenerUsuario = cache(async (): Promise<UsuarioSesion | null> => {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from('usuario')
    .select('id, nombre, email, activo, rol:rol_id(nombre)')
    .eq('id', user.id)
    .single();

  if (!perfil || !perfil.activo) return null;

  const { data: permisos } = await supabase.rpc('mis_permisos');

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    email: perfil.email,
    rol: perfil.rol?.nombre ?? '—',
    permisos: new Set(permisos ?? []),
  };
});

/** Exige sesion iniciada. Redirige al login si no la hay. */
export async function requerirUsuario(): Promise<UsuarioSesion> {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect('/login');
  return usuario;
}

/**
 * Exige un permiso concreto para renderizar una pagina.
 *
 * Es una comodidad para mostrar un mensaje claro: la autorizacion de verdad la
 * aplica RLS en la base de datos, que no depende de esta comprobacion.
 */
export async function requerirPermiso(codigo: string): Promise<UsuarioSesion> {
  const usuario = await requerirUsuario();
  if (!usuario.permisos.has(codigo)) {
    redirect(`/sin-permiso?requerido=${encodeURIComponent(codigo)}`);
  }
  return usuario;
}

/** Registra en la bitacora una accion que no es un cambio de tabla (ADM-02). */
export async function registrarEnBitacora(
  accion: string,
  modulo?: string,
  descripcion?: string,
): Promise<void> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('registrar_en_bitacora', {
    p_accion: accion,
    p_modulo: modulo ?? undefined,
    p_descripcion: descripcion ?? undefined,
  });
  // Un fallo de bitacora no debe tumbar la accion del usuario, pero si debe verse.
  if (error) console.error('No se pudo registrar en bitacora:', error.message);
}
