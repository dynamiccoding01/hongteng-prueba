/**
 * Verifica que el esquema aplicado se comporte como dice la documentacion.
 * No basta con que las tablas existan: hay que comprobar que los triggers,
 * la bitacora y las reglas de inventario realmente funcionan.
 *
 *   npx tsx scripts/verificar-esquema.ts
 *
 * Usa la Management API (SUPABASE_ACCESS_TOKEN). Deja la base como estaba:
 * todas las pruebas corren dentro de una transaccion que se revierte.
 */

process.loadEnvFile('.env.local');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!token || !urlProyecto) {
  console.error('Faltan SUPABASE_ACCESS_TOKEN o NEXT_PUBLIC_SUPABASE_URL en .env.local');
  process.exit(1);
}

const ref = new URL(urlProyecto).hostname.split('.')[0]!;

async function consultar(sql: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error(cuerpo);
  return cuerpo ? (JSON.parse(cuerpo) as Record<string, unknown>[]) : [];
}

let ok = 0;
let fallos = 0;

function comprobar(titulo: string, condicion: boolean, detalle: string) {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${titulo}`);
  } else {
    fallos++;
    console.log(`  ✗ ${titulo}\n      ${detalle}`);
  }
}

async function main() {
  console.log(`\nVerificando esquema en ${ref}\n`);

  // --- Estructura -----------------------------------------------------------
  console.log('Estructura');

  const tablas = await consultar(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name;
  `);
  const nombres = tablas.map((t) => t['table_name'] as string);
  comprobar(`16 tablas creadas (hay ${nombres.length})`, nombres.length >= 16, nombres.join(', '));

  const vistas = await consultar(`
    select table_name from information_schema.views where table_schema = 'public';
  `);
  comprobar(
    `3 vistas de consulta (hay ${vistas.length})`,
    vistas.length === 3,
    vistas.map((v) => v['table_name']).join(', '),
  );

  // --- RLS ------------------------------------------------------------------
  console.log('\nSeguridad');

  const sinRls = await consultar(`
    select c.relname as tabla
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not c.relrowsecurity
       and c.relname <> '_migracion_aplicada';
  `);
  comprobar(
    'RLS habilitado en todas las tablas',
    sinRls.length === 0,
    `sin RLS: ${sinRls.map((t) => t['tabla']).join(', ')}`,
  );

  const politicas = await consultar(
    `select count(*)::int as n from pg_policies where schemaname = 'public';`,
  );
  const nPoliticas = Number(politicas[0]?.['n'] ?? 0);
  comprobar(`Politicas RLS definidas (${nPoliticas})`, nPoliticas >= 20, 'se esperaban 20 o mas');

  // --- Bitacora -------------------------------------------------------------
  console.log('\nBitacora (ADM-02)');

  const triggersBitacora = await consultar(`
    select event_object_table as tabla
      from information_schema.triggers
     where trigger_schema = 'public' and trigger_name like 'tr_bitacora_%'
     group by event_object_table;
  `);
  const conBitacora = new Set(triggersBitacora.map((t) => t['tabla'] as string));
  const esperadas = [
    'rol',
    'permiso',
    'rol_permiso',
    'usuario',
    'moneda',
    'tipo_cambio',
    'categoria',
    'proveedor',
    'bodega',
    'zona',
    'ubicacion_zeta',
    'producto',
    'producto_variante',
    'movimiento',
  ];
  const faltantes = esperadas.filter((t) => !conBitacora.has(t));
  comprobar(
    `Trigger de bitacora en las 14 tablas operativas`,
    faltantes.length === 0,
    `faltan: ${faltantes.join(', ')}`,
  );

  const inmutable = await consultar(`
    select count(*)::int as n from information_schema.triggers
     where trigger_schema = 'public'
       and event_object_table = 'bitacora'
       and action_statement like '%fn_bitacora_inmutable%';
  `);
  comprobar(
    'Bitacora protegida contra UPDATE y DELETE',
    Number(inmutable[0]?.['n'] ?? 0) === 2,
    `triggers encontrados: ${inmutable[0]?.['n']}`,
  );

  // El seed ya genero registros de bitacora al insertar roles y permisos.
  const registros = await consultar(`select count(*)::int as n from bitacora;`);
  const nRegistros = Number(registros[0]?.['n'] ?? 0);
  comprobar(
    `La bitacora se llena sola (${nRegistros} registros del seed)`,
    nRegistros > 0,
    'no se registro nada al ejecutar el seed',
  );

  const porTabla = await consultar(`
    select tabla, accion, count(*)::int as n from bitacora
     group by tabla, accion order by n desc limit 5;
  `);
  for (const f of porTabla) {
    console.log(`      ${String(f['tabla']).padEnd(14)} ${f['accion']}  ${f['n']}`);
  }

  // --- Reglas de inventario -------------------------------------------------
  console.log('\nInventario');

  // Todo dentro de una transaccion que se revierte al final.
  const prueba = await consultar(`
    begin;

    insert into bodega (codigo, nombre) values ('TEST', 'Bodega de prueba');
    insert into zona (bodega_id, codigo)
      select id, 'Z-TEST' from bodega where codigo = 'TEST';
    insert into producto (codigo, categoria_id, rango_tallas)
      select 'TEST-001', id, '30-35' from categoria where codigo = 'NINO';
    insert into producto_variante (producto_id, unidades_por_caja)
      select id, 48 from producto where codigo = 'TEST-001';

    -- ENTRADA de 10 cajas: deben quedar 10 cajas y 480 unidades
    insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo)
      select v.id, z.id, 'ENTRADA', 10, 'MIGRACION'
        from producto_variante v, zona z
       where z.codigo = 'Z-TEST'
         and v.producto_id = (select id from producto where codigo = 'TEST-001');

    -- SALIDA de 3 cajas: deben quedar 7 cajas y 336 unidades
    insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo)
      select v.id, z.id, 'SALIDA', 3, 'VENTA'
        from producto_variante v, zona z
       where z.codigo = 'Z-TEST'
         and v.producto_id = (select id from producto where codigo = 'TEST-001');

    select
      s.cajas::text                                as cajas,
      s.unidades::text                             as unidades,
      (select count(*)::int from movimiento m
        where m.variante_id = s.variante_id)       as movimientos,
      (select max(saldo_cajas)::text from movimiento m
        where m.variante_id = s.variante_id
          and m.tipo = 'SALIDA')                   as saldo_tras_salida,
      (select count(*)::int from bitacora b
        where b.tabla = 'movimiento')              as bitacora_movimientos
      from stock s
      join zona z on z.id = s.zona_id
     where z.codigo = 'Z-TEST';
  `);

  const r = prueba[0];
  comprobar(
    'Entrada 10 cajas − salida 3 = 7 cajas',
    Number(r?.['cajas']) === 7,
    `cajas resultantes: ${r?.['cajas']}`,
  );
  comprobar(
    'Conversion caja → unidades (7 × 48 = 336)',
    Number(r?.['unidades']) === 336,
    `unidades: ${r?.['unidades']}`,
  );
  comprobar(
    'Saldo registrado en el kardex tras la salida = 7',
    Number(r?.['saldo_tras_salida']) === 7,
    `saldo_cajas: ${r?.['saldo_tras_salida']}`,
  );
  comprobar(
    'Los movimientos quedaron en la bitacora',
    Number(r?.['bitacora_movimientos']) >= 2,
    `registros: ${r?.['bitacora_movimientos']}`,
  );

  await consultar('rollback;');

  // Comprobar que el rollback dejo todo limpio
  const restos = await consultar(
    `select count(*)::int as n from producto where codigo = 'TEST-001';`,
  );
  comprobar(
    'Los datos de prueba se revirtieron',
    Number(restos[0]?.['n'] ?? 0) === 0,
    'quedaron datos de prueba en la base',
  );

  // --- Sobregiro ------------------------------------------------------------
  let bloqueado = false;
  try {
    await consultar(`
      begin;
      insert into bodega (codigo, nombre) values ('TEST2', 'Bodega de prueba 2');
      insert into zona (bodega_id, codigo) select id, 'Z-TEST2' from bodega where codigo = 'TEST2';
      insert into producto (codigo, categoria_id) select 'TEST-002', id from categoria where codigo = 'NINO';
      insert into producto_variante (producto_id, unidades_por_caja)
        select id, 12 from producto where codigo = 'TEST-002';
      insert into movimiento (variante_id, zona_id, tipo, cajas)
        select v.id, z.id, 'SALIDA', 5 from producto_variante v, zona z
         where z.codigo = 'Z-TEST2'
           and v.producto_id = (select id from producto where codigo = 'TEST-002');
      rollback;
    `);
  } catch {
    bloqueado = true;
    await consultar('rollback;').catch(() => {});
  }
  comprobar(
    'No se puede despachar sin existencia (stock negativo rechazado)',
    bloqueado,
    'la base permitio dejar el stock en negativo',
  );

  // --- Seed -----------------------------------------------------------------
  console.log('\nDatos base');
  const conteos = await consultar(`
    select
      (select count(*)::int from rol)         as roles,
      (select count(*)::int from permiso)     as permisos,
      (select count(*)::int from rol_permiso) as asignaciones,
      (select count(*)::int from categoria)   as categorias,
      (select count(*)::int from moneda)      as monedas;
  `);
  const c = conteos[0]!;
  console.log(
    `      roles: ${c['roles']} · permisos: ${c['permisos']} · ` +
      `asignaciones rol-permiso: ${c['asignaciones']} · ` +
      `categorias: ${c['categorias']} · monedas: ${c['monedas']}`,
  );
  comprobar('4 roles creados', Number(c['roles']) === 4, `hay ${c['roles']}`);
  comprobar('23 permisos creados', Number(c['permisos']) === 23, `hay ${c['permisos']}`);
  comprobar('4 categorias creadas', Number(c['categorias']) === 4, `hay ${c['categorias']}`);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${ok} comprobaciones OK, ${fallos} fallidas\n`);
  if (fallos > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error('\nError:', e instanceof Error ? e.message : e);
  process.exit(1);
});
