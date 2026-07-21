/**
 * Aplica las migraciones de supabase/migrations al proyecto en la nube usando
 * la Management API de Supabase.
 *
 *   npm run db:migrar           aplica las migraciones pendientes
 *   npm run db:migrar -- --seed aplica ademas supabase/seed.sql
 *
 * Requiere en .env.local:
 *   SUPABASE_ACCESS_TOKEN=sbp_...   (Personal Access Token del panel)
 *
 * Comportamiento:
 *  - Lleva registro en la tabla _migracion_aplicada: una migracion ya aplicada
 *    no se vuelve a ejecutar.
 *  - Cada migracion corre dentro de begin/commit: si falla a la mitad, no deja
 *    el esquema inconsistente.
 *  - Nunca imprime el token.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.loadEnvFile('.env.local');

const API = 'https://api.supabase.com';
const DIR_MIGRACIONES = join('supabase', 'migrations');
const SEED = join('supabase', 'seed.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!token) {
  console.error(
    '\nFalta SUPABASE_ACCESS_TOKEN en .env.local.\n' +
      'Crealo en https://supabase.com/dashboard/account/tokens y pegalo ahi.\n',
  );
  process.exit(1);
}
if (!urlProyecto) {
  console.error('\nFalta NEXT_PUBLIC_SUPABASE_URL en .env.local.\n');
  process.exit(1);
}

/** El "ref" del proyecto es el subdominio: https://<ref>.supabase.co */
const ref = new URL(urlProyecto).hostname.split('.')[0];
if (!ref) {
  console.error(`\nNo se pudo deducir el ref del proyecto desde '${urlProyecto}'.\n`);
  process.exit(1);
}

/** Ejecuta SQL contra la base del proyecto. Devuelve las filas del resultado. */
async function ejecutar(sql: string): Promise<unknown[]> {
  const respuesta = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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

  return cuerpo ? (JSON.parse(cuerpo) as unknown[]) : [];
}

async function main() {
  const conSeed = process.argv.includes('--seed');

  console.log(`\nProyecto: ${ref}`);
  console.log(`Token:    presente (${token!.length} caracteres, no se muestra)\n`);

  // Tabla de control: sabe que migraciones ya se aplicaron.
  await ejecutar(`
    create table if not exists _migracion_aplicada (
      nombre      text primary key,
      aplicada_en timestamptz not null default now()
    );
  `);

  const aplicadas = new Set(
    (await ejecutar('select nombre from _migracion_aplicada;')).map(
      (f) => (f as { nombre: string }).nombre,
    ),
  );

  const migraciones = readdirSync(DIR_MIGRACIONES)
    .filter((n) => n.endsWith('.sql'))
    .sort();

  let nuevas = 0;
  for (const archivo of migraciones) {
    if (aplicadas.has(archivo)) {
      console.log(`  · ${archivo.padEnd(26)} ya aplicada`);
      continue;
    }

    const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
    process.stdout.write(`  → ${archivo.padEnd(26)} aplicando... `);

    try {
      await ejecutar(
        `begin;\n${sql}\ninsert into _migracion_aplicada (nombre) values ('${archivo}');\ncommit;`,
      );
      console.log('OK');
      nuevas++;
    } catch (e) {
      console.log('FALLO');
      console.error(`\n${archivo}:\n${e instanceof Error ? e.message : String(e)}\n`);
      console.error('No se aplico ningun cambio de esta migracion (rollback).');
      process.exit(1);
    }
  }

  if (conSeed) {
    process.stdout.write(`\n  → seed.sql${' '.repeat(20)} aplicando... `);
    try {
      await ejecutar(`begin;\n${readFileSync(SEED, 'utf8')}\ncommit;`);
      console.log('OK');
    } catch (e) {
      console.log('FALLO');
      console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
  }

  console.log(
    `\n${nuevas} migracion(es) nueva(s) aplicada(s), ` +
      `${aplicadas.size} ya estaban.` +
      (conSeed ? ' Seed ejecutado.' : ' Seed no ejecutado (usar --seed).'),
  );
  console.log('Verificar con: npm run db:probar\n');
}

main().catch((e: unknown) => {
  console.error('\nError:', e instanceof Error ? e.message : e);
  process.exit(1);
});
