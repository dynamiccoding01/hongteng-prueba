/**
 * Concatena las migraciones + el seed en un unico archivo para pegarlo en el
 * editor SQL de Supabase, cuando no se dispone del CLI.
 *
 *   npx tsx scripts/generar-sql-completo.ts
 *
 * El archivo resultante es DERIVADO: no se versiona ni se edita a mano. La
 * unica fuente de verdad sigue siendo supabase/migrations.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR_MIGRACIONES = join('supabase', 'migrations');
const SEED = join('supabase', 'seed.sql');
const SALIDA = join('supabase', '_aplicar-en-editor-sql.sql');

const migraciones = readdirSync(DIR_MIGRACIONES)
  .filter((n) => n.endsWith('.sql'))
  .sort();

const partes: string[] = [
  '-- ARCHIVO GENERADO. No editar a mano.',
  '-- Origen: supabase/migrations/*.sql + supabase/seed.sql',
  `-- Generado: ${new Date().toISOString()}`,
  '--',
  '-- Pegar completo en el editor SQL de Supabase y ejecutar una sola vez.',
  'begin;',
  '',
];

for (const archivo of migraciones) {
  partes.push(`-- ${'='.repeat(70)}`, `-- ${archivo}`, `-- ${'='.repeat(70)}`, '');
  partes.push(readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8'), '');
}

partes.push(`-- ${'='.repeat(70)}`, '-- seed.sql', `-- ${'='.repeat(70)}`, '');
partes.push(readFileSync(SEED, 'utf8'), '');
partes.push('commit;', '');

writeFileSync(SALIDA, partes.join('\n'), 'utf8');

console.log(`Generado ${SALIDA}`);
console.log(`  ${migraciones.length} migraciones + seed`);
console.log(`  ${partes.join('\n').split('\n').length} lineas`);
console.log('\nTodo va dentro de begin/commit: si algo falla, no queda a medias.');
