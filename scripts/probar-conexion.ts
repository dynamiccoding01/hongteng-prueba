/**
 * Verifica la conexion con el proyecto Supabase y muestra que tablas del
 * esquema ya existen.
 *
 *   npx tsx scripts/probar-conexion.ts
 *
 * No escribe nada. Nunca imprime claves.
 */

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !clave) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o la clave publica en .env.local');
  process.exit(1);
}

/** Tablas que deberian existir una vez aplicadas las migraciones 0001-0005. */
const TABLAS_ESPERADAS = [
  'rol',
  'permiso',
  'rol_permiso',
  'usuario',
  'auditoria',
  'moneda',
  'tipo_cambio',
  'categoria',
  'proveedor',
  'bodega',
  'zona',
  'ubicacion_zeta',
  'producto',
  'producto_variante',
  'stock',
  'movimiento',
];

async function main() {
  console.log(`\nProyecto: ${url}`);
  console.log(`Clave:    ${clave!.slice(0, 16)}… (${clave!.length} caracteres)\n`);

  // 1. El servicio de autenticacion responde.
  //    Nota: NO se consulta /rest/v1/ (el listado OpenAPI): ese endpoint exige
  //    clave secreta y devuelve 401 aunque la publishable key sea correcta.
  const salud = await fetch(`${url}/auth/v1/health`, { headers: { apikey: clave! } });
  console.log(`Auth /health ............ HTTP ${salud.status} ${salud.statusText}`);
  if (!salud.ok) {
    console.error('\nEl proyecto no responde. Revisa la URL en el panel de Supabase.');
    process.exit(1);
  }

  // 2. La clave es aceptada por PostgREST
  const supabase = createClient(url!, clave!);
  const { error: errorClave } = await supabase
    .from('__sonda_de_conexion__')
    .select('*', { head: true });

  if (errorClave?.message.toLowerCase().includes('api key')) {
    console.error(`\nLa clave fue rechazada: ${errorClave.message}`);
    process.exit(1);
  }
  console.log('Clave publica ........... aceptada por PostgREST');

  const { error: errorAuth } = await supabase.auth.getSession();
  console.log(`Sesion .................. ${errorAuth ? `ERROR: ${errorAuth.message}` : 'OK'}`);

  // 3. Control: una tabla que con certeza no existe. Sirve para saber que
  //    respuesta da este proyecto ante una tabla ausente, y no confundirla
  //    con una tabla que existe pero esta vacia o bloqueada por RLS.
  const control = await supabase.from('__no_existe_control__').select('*').limit(1);
  console.log(
    `\nControl (tabla inexistente): ` +
      `${control.error ? `${control.error.code ?? 'sin codigo'} — ${control.error.message}` : 'SIN ERROR (inesperado)'}`,
  );

  // 4. Que tablas del esquema ya existen
  console.log('\nTablas del esquema:');
  let existentes = 0;
  for (const tabla of TABLAS_ESPERADAS) {
    const { error } = await supabase.from(tabla).select('*').limit(1);
    if (!error) {
      existentes++;
      console.log(`  ✓ ${tabla}`);
    } else if (error.code === control.error?.code) {
      console.log(`  · ${tabla.padEnd(18)} no existe`);
    } else {
      console.log(`  ? ${tabla.padEnd(18)} ${error.code ?? ''} ${error.message}`);
    }
  }

  console.log(`\n${existentes}/${TABLAS_ESPERADAS.length} tablas creadas.`);
  if (existentes === 0) {
    console.log('Conexion OK. Falta aplicar las migraciones de supabase/migrations.\n');
  } else if (existentes === TABLAS_ESPERADAS.length) {
    console.log('Esquema completo.\n');
  } else {
    console.log('Esquema incompleto: revisar que migraciones se aplicaron.\n');
  }
}

main().catch((e: unknown) => {
  console.error('\nFallo la conexion:', e instanceof Error ? e.message : e);
  process.exit(1);
});
