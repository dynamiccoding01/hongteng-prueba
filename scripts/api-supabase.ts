/**
 * Cliente compartido de la Management API de Supabase para los scripts.
 *
 * Lee las credenciales de .env.local y nunca las imprime.
 */

process.loadEnvFile('.env.local');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!urlProyecto) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL en .env.local');
  process.exit(1);
}

if (!token) {
  console.error(
    '\nFalta SUPABASE_ACCESS_TOKEN en .env.local.\n' +
      'Crealo en https://supabase.com/dashboard/account/tokens y pegalo ahi.\n',
  );
  process.exit(1);
}

/** El "ref" del proyecto es el subdominio: https://<ref>.supabase.co */
export const ref = new URL(urlProyecto).hostname.split('.')[0]!;
export const tokenAcceso = token;

/** Ejecuta SQL contra la base del proyecto. Devuelve las filas del resultado. */
export async function consultar(sql: string): Promise<Record<string, unknown>[]> {
  const respuesta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });

  const cuerpo = await respuesta.text();

  if (!respuesta.ok) {
    let detalle = cuerpo;
    try {
      const json: unknown = JSON.parse(cuerpo);
      if (json && typeof json === 'object' && 'message' in json) {
        detalle = String((json as { message: unknown }).message);
      }
    } catch {
      // El cuerpo no era JSON; se muestra tal cual.
    }
    throw new Error(`HTTP ${respuesta.status} — ${detalle}`);
  }

  return cuerpo ? (JSON.parse(cuerpo) as Record<string, unknown>[]) : [];
}

/** Escapa comillas simples para interpolar un valor en SQL. */
export function lit(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}
