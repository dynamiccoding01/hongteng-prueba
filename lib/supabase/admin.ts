import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { env, getServiceRoleKey } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente con la clave secreta: **OMITE RLS**.
 *
 * Existe por una sola razón: `usuario.id` es una FK contra `auth.users`, y crear
 * o modificar una cuenta de autenticación (correo, contraseña) solo se puede
 * hacer con la API de administración de Supabase, que exige esta clave.
 *
 * Regla de uso: úsese **únicamente** para operaciones sobre `auth.users`. Todo
 * lo que toque tablas del esquema `public` va con `crearClienteServidor()`, para
 * que la autorización siga siendo RLS y no una comprobación en TypeScript. Sin
 * eso, un Administrador podría fabricarse un Superadmin.
 */
export function crearClienteAdmin() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Mensaje para el caso en que la clave secreta no esté configurada. Sin ella el
 * alta de usuarios no funciona, y el error crudo de `getServiceRoleKey()` no le
 * dice nada a quien está en la pantalla.
 */
export const AVISO_SIN_CLAVE =
  'Falta configurar SUPABASE_SECRET_KEY en el servidor. Sin esa clave el sistema no puede crear cuentas de acceso; pídalo al área de TI.';
