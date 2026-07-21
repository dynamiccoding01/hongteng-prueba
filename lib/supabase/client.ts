'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Cliente Supabase para componentes de navegador.
 * Usa la clave anonima: todo lo que puede hacer esta limitado por las politicas
 * RLS definidas en supabase/migrations/0005_rls.sql.
 */
export function crearClienteNavegador() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
