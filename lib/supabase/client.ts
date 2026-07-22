'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente Supabase para componentes de navegador.
 * Usa la clave publica: todo lo que puede hacer esta limitado por las politicas
 * RLS definidas en supabase/migrations/0005_rls.sql.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
