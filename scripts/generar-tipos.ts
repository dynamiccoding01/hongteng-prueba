/**
 * Genera lib/supabase/database.types.ts desde el esquema real del proyecto.
 *
 *   npm run db:types
 *
 * Los tipos NO se escriben a mano: se derivan de la base para que un cambio de
 * esquema rompa la compilacion en vez de fallar en produccion.
 */

import { writeFileSync } from 'node:fs';
import { ref, tokenAcceso } from './api-supabase';

const SALIDA = 'lib/supabase/database.types.ts';

async function main() {
  const respuesta = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${tokenAcceso}` } },
  );

  if (!respuesta.ok) {
    console.error(`HTTP ${respuesta.status}: ${await respuesta.text()}`);
    process.exit(1);
  }

  const { types } = (await respuesta.json()) as { types: string };

  writeFileSync(
    SALIDA,
    `// ARCHIVO GENERADO — no editar a mano.\n// Regenerar con: npm run db:types\n\n${types}`,
    'utf8',
  );

  console.log(`Generado ${SALIDA} (${types.split('\n').length} lineas)`);
}

main().catch((e: unknown) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
