import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Mantiene la sesion del usuario en cookies, de modo que las politicas RLS se
 * evaluan con su identidad real.
 */
export async function crearClienteServidor() {
  const almacenCookies = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesNuevas) {
        try {
          for (const { name, value, options } of cookiesNuevas) {
            almacenCookies.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies; el middleware ya
          // refresco la sesion, asi que se puede ignorar sin riesgo.
        }
      },
    },
  });
}

/** Permisos del usuario autenticado, para decidir que se muestra en la interfaz. */
export async function obtenerMisPermisos(): Promise<Set<string>> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('mis_permisos');
  if (error || !data) return new Set();
  return new Set(data as string[]);
}
