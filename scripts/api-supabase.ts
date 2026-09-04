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

/**
 * Reintentos ante el rate limit de la Management API.
 *
 * La API responde 429 con facilidad —correr `npm test` dos veces seguidas
 * bastaba— y sin reintentos eso tumbaba de golpe los seis archivos de tests de
 * integración con un error que no tiene nada que ver con el código. Un rojo que
 * no es del cambio que se acaba de hacer es peor que no tener el test: enseña a
 * ignorarlo.
 *
 * La espera se dobla en cada intento (2 s, 4 s, 8 s…) hasta un tope, que es lo
 * que pide un límite por ventana de tiempo.
 */
const REINTENTOS = 7;
const ESPERA_INICIAL_MS = 2000;
const ESPERA_MAXIMA_MS = 20_000;

/**
 * Separación mínima entre peticiones.
 *
 * Reintentar no basta: la suite de integración dispara cientos de consultas
 * seguidas y el límite es por ventana de tiempo, así que se sale de ella y no
 * vuelve a entrar. Espaciarlas mantiene el ritmo por debajo del tope (unas 54
 * por minuto) y hace que los reintentos sean la excepción y no el mecanismo.
 *
 * Las peticiones se encolan: `fileParallelism` ya está en `false`, pero dentro
 * de un mismo archivo puede haber `Promise.all`.
 */
const INTERVALO_MINIMO_MS = 1100;

const esperar = (ms: number): Promise<void> => new Promise((listo) => setTimeout(listo, ms));

/** Cola de un solo carril: cada consulta espera su turno y su intervalo. */
let turno: Promise<void> = Promise.resolve();

function pedirTurno(): Promise<void> {
  const mio = turno.then(() => esperar(INTERVALO_MINIMO_MS));
  turno = mio;
  return mio;
}

/** Ejecuta SQL contra la base del proyecto. Devuelve las filas del resultado. */
export async function consultar(sql: string): Promise<Record<string, unknown>[]> {
  let espera = ESPERA_INICIAL_MS;

  for (let intento = 1; ; intento++) {
    await pedirTurno();

    const respuesta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });

    const cuerpo = await respuesta.text();

    if (respuesta.ok) {
      return cuerpo ? (JSON.parse(cuerpo) as Record<string, unknown>[]) : [];
    }

    // Solo el rate limit se reintenta. Un error de SQL saldría igual de mal en
    // cada intento y además escondería su mensaje detrás de las esperas.
    if (respuesta.status === 429 && intento < REINTENTOS) {
      await esperar(espera);
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
      continue;
    }

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
}

/** Escapa comillas simples para interpolar un valor en SQL. */
export function lit(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}
