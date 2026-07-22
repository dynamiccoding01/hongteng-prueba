/**
 * Muestra los ultimos registros de la bitacora (ADM-02).
 *
 *   npx tsx scripts/ver-bitacora.ts [cantidad]
 */

import { consultar } from './api-supabase';

async function main() {
  const limite = Number(process.argv[2] ?? 20);

  const filas = await consultar(`
    select
      to_char(created_at, 'DD-MM HH24:MI:SS') as cuando,
      usuario_email                            as usuario,
      accion,
      coalesce(tabla, '—')                     as tabla,
      coalesce(registro_id, '—')               as registro,
      coalesce(
        descripcion,
        array_to_string(campos_modificados, ', '),
        '—'
      )                                        as detalle
      from v_bitacora
     order by created_at desc
     limit ${limite};
  `);

  if (filas.length === 0) {
    console.log('\nLa bitacora esta vacia.\n');
    return;
  }

  console.log('');
  console.log(
    'CUANDO'.padEnd(15) +
      'USUARIO'.padEnd(26) +
      'ACCION'.padEnd(9) +
      'TABLA'.padEnd(20) +
      'REG'.padEnd(6) +
      'DETALLE',
  );
  console.log('─'.repeat(110));

  for (const f of filas) {
    console.log(
      String(f['cuando']).padEnd(15) +
        String(f['usuario']).slice(0, 24).padEnd(26) +
        String(f['accion']).padEnd(9) +
        String(f['tabla']).padEnd(20) +
        String(f['registro']).padEnd(6) +
        String(f['detalle']).slice(0, 40),
    );
  }
  console.log('');
}

main().catch((e: unknown) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
