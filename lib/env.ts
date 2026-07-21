import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar.
 * Si falta una, la aplicacion falla de inmediato con un mensaje claro en vez de
 * romperse mas adelante con un `undefined`.
 */
const esquemaCliente = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL valida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY)'),
});

export const env = esquemaCliente.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Supabase renombro la clave anonima a "publishable key" (sb_publishable_...).
  // Se aceptan los dos nombres: los proyectos nuevos usan el primero.
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/**
 * Clave de servicio: OMITE las politicas RLS.
 * Solo puede usarse en codigo de servidor (scripts, Route Handlers). Nunca en
 * un componente de cliente.
 */
export function getServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('La clave de servicio no puede usarse en el navegador');
  }
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error('Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY)');
  return clave;
}
