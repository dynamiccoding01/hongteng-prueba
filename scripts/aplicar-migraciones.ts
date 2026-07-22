/**
 * Aplica las migraciones de supabase/migrations al proyecto en la nube usando
 * la Management API de Supabase.
 *
 *   npm run db:migrar           aplica las migraciones pendientes
 *   npm run db:migrar -- --seed aplica ademas supabase/seed.sql
 *
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local.
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
import { consultar, lit, ref } from './api-supabase';

const DIR_MIGRACIONES = join('supabase', 'migrations');
const SEED = join('supabase', 'seed.sql');

async function main() {
  const conSeed = process.argv.includes('--seed');

  console.log(`\nProyecto: ${ref}\n`);

  // Tabla de control: sabe que migraciones ya se aplicaron.
  await consultar(`
    create table if not exists _migracion_aplicada (
      nombre      text primary key,
      aplicada_en timestamptz not null default now()
    );
  `);

  const aplicadas = new Set(
    (await consultar('select nombre from _migracion_aplicada;')).map((f) => f['nombre'] as string),
  );

  const migraciones = readdirSync(DIR_MIGRACIONES)
    .filter((n) => n.endsWith('.sql'))
    .sort();

  let nuevas = 0;
  for (const archivo of migraciones) {
    if (aplicadas.has(archivo)) {
      console.log(`  · ${archivo.padEnd(40)} ya aplicada`);
      continue;
    }

    const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
    process.stdout.write(`  → ${archivo.padEnd(40)} aplicando... `);

    try {
      await consultar(
        `begin;\n${sql}\ninsert into _migracion_aplicada (nombre) values (${lit(archivo)});\ncommit;`,
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
    process.stdout.write(`\n  → ${'seed.sql'.padEnd(40)} aplicando... `);
    try {
      await consultar(`begin;\n${readFileSync(SEED, 'utf8')}\ncommit;`);
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
