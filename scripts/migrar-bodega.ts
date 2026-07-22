/**
 * ADM-04: migración de BODEGA.xls al inventario (opción A: manda 实存).
 *
 *   npx tsx scripts/migrar-bodega.ts             <- simulación (no escribe nada)
 *   npx tsx scripts/migrar-bodega.ts --ejecutar  <- carga real
 *
 * Lee la planilla desde BODEGA_XLS_PATH (.env.local) o ./datos/BODEGA.xls.
 * Es de una sola vez: si ya existen movimientos MIGRACION, se niega a correr.
 * Las filas cuya anotación de zona no cuadra van a la zona POR-CONFIRMAR con
 * la anotación original en el motivo (ver PLAN_AVANZE.md, hallazgo abierto).
 */

import { existsSync } from 'node:fs';
import { consultar, lit } from './api-supabase';
import { HOJAS_DETALLE, leerPlanilla, TOTALES_ESPERADOS } from '../lib/bodega/leer-planilla';
import {
  planificarMigracion,
  ZONA_POR_CONFIRMAR,
  type MovimientoPlan,
} from '../lib/bodega/planificar-migracion';

const ejecutar = process.argv.includes('--ejecutar');
const ruta = process.env.BODEGA_XLS_PATH ?? './datos/BODEGA.xls';

const TAMANO_LOTE = 200;

function lotes<T>(elementos: T[], tamano: number): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) {
    resultado.push(elementos.slice(i, i + tamano));
  }
  return resultado;
}

async function main() {
  if (!existsSync(ruta)) {
    console.error(
      `No se encontró la planilla en '${ruta}'.\n` +
        'Coloque el archivo del cliente ahí, o defina BODEGA_XLS_PATH en .env.local.',
    );
    process.exit(1);
  }

  // ------------------------------------------------------------------ plan
  const porHoja = leerPlanilla(ruta);
  const filas = [...porHoja.values()].flat();
  const plan = planificarMigracion(filas);

  console.log(`\nPlanilla: ${ruta} (${filas.length} filas)\n`);
  console.log(`  Productos/variantes a catalogar: ${plan.productos.length}`);
  console.log(`  Zonas a asegurar:                ${plan.zonas.length}`);
  console.log(`  Movimientos de entrada:          ${plan.movimientos.length}`);
  console.log(`  Excepciones (a POR-CONFIRMAR o descartadas): ${plan.excepciones.length}\n`);

  for (const hoja of HOJAS_DETALLE) {
    const esperado = TOTALES_ESPERADOS[hoja].existencia;
    const planificado = plan.totalPorHoja[hoja];
    const marca = planificado === esperado ? 'OK' : `≠ esperado ${esperado}`;
    console.log(`  ${hoja.padEnd(8)} ${String(planificado).padStart(6)} cajas  ${marca}`);
  }

  if (plan.excepciones.length > 0) {
    console.log('\nExcepciones (revisar en la toma de inventario):');
    for (const e of plan.excepciones) {
      console.log(`  · ${e.hoja} fila ${e.fila} [${e.codigo}]: ${e.motivo}`);
    }
  }

  if (!ejecutar) {
    console.log('\nSimulación terminada. Nada se escribió. Para cargar: --ejecutar\n');
    return;
  }

  // ------------------------------------------------------------- barreras
  const [previa] = await consultar(
    `select count(*)::int as n from movimiento where documento_tipo = 'MIGRACION'`,
  );
  if (Number(previa?.n) > 0) {
    console.error(
      `\nYa existen ${Number(previa?.n)} movimientos MIGRACION: la migración ya corrió.\n` +
        'Si de verdad necesita repetirla, primero resuelva ese stock con ajustes.',
    );
    process.exit(1);
  }

  const [bodega] = await consultar(`select id from bodega where codigo = 'IQQ'`);
  if (!bodega) {
    console.error("No existe la bodega 'IQQ'. Ejecute el seed primero.");
    process.exit(1);
  }
  const bodegaId = Number(bodega.id);

  // -------------------------------------------------------------- catálogo
  console.log('\nCargando…');

  const valoresZona = plan.zonas
    .map(
      (z) =>
        `(${lit(z)}, ${lit(z === ZONA_POR_CONFIRMAR ? 'Ubicación por confirmar en toma de inventario' : '')})`,
    )
    .join(', ');
  await consultar(`
    insert into zona (bodega_id, codigo, descripcion)
    select ${bodegaId}, v.codigo, nullif(v.descripcion, '')
      from (values ${valoresZona}) as v(codigo, descripcion)
     where not exists (
       select 1 from zona z where z.bodega_id = ${bodegaId} and z.codigo = v.codigo
     )`);
  console.log(`  zonas aseguradas (${plan.zonas.length})`);

  for (const lote of lotes(plan.productos, TAMANO_LOTE)) {
    const valores = lote
      .map((p) => `(${lit(p.codigo)}, ${lit(p.categoria)}, ${lit(p.rangoTallas)})`)
      .join(', ');
    await consultar(`
      insert into producto (codigo, categoria_id, rango_tallas, unidad_medida)
      select v.codigo, c.id, nullif(v.rango, ''), c.unidad_medida_default
        from (values ${valores}) as v(codigo, categoria, rango)
        join categoria c on c.codigo = v.categoria
       where not exists (select 1 from producto p where p.codigo = v.codigo)`);
    await consultar(`
      insert into producto_variante (producto_id, unidades_por_caja)
      select p.id, v.factor::numeric
        from (values ${lote.map((p) => `(${lit(p.codigo)}, ${p.unidadesPorCaja})`).join(', ')})
             as v(codigo, factor)
        join producto p on p.codigo = v.codigo
       where not exists (
         select 1 from producto_variante pv
          where pv.producto_id = p.id and pv.unidades_por_caja = v.factor::numeric
       )`);
  }
  console.log(`  productos y variantes catalogados (${plan.productos.length})`);

  // ------------------------------------------------------------ movimientos
  let cargados = 0;
  for (const lote of lotes(plan.movimientos, TAMANO_LOTE)) {
    const valores = lote
      .map(
        (m: MovimientoPlan) =>
          `(${lit(m.codigo)}, ${m.unidadesPorCaja}, ${lit(m.zona)}, ${m.cajas}, ${lit(m.motivo)})`,
      )
      .join(', ');
    await consultar(`
      insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, motivo)
      select pv.id, z.id, 'ENTRADA', v.cajas::numeric, 'MIGRACION', v.motivo
        from (values ${valores}) as v(codigo, factor, zona, cajas, motivo)
        join producto p on p.codigo = v.codigo
        join producto_variante pv
          on pv.producto_id = p.id and pv.unidades_por_caja = v.factor::numeric
        join zona z on z.bodega_id = ${bodegaId} and z.codigo = v.zona`);
    cargados += lote.length;
    console.log(`  movimientos ${cargados}/${plan.movimientos.length}`);
  }

  // ----------------------------------------------------------- conciliación
  const [stock] = await consultar(`select coalesce(sum(cajas), 0)::numeric as total from stock`);
  const esperadoTotal = plan.movimientos.reduce((s, m) => s + m.cajas, 0);
  const cargadoTotal = Number(stock?.total);

  console.log(
    `\nConciliación: planificado ${esperadoTotal} cajas · en stock ${cargadoTotal} cajas`,
  );
  if (cargadoTotal !== esperadoTotal) {
    console.error('¡DESCUADRE! Revise los movimientos MIGRACION antes de operar.');
    process.exit(1);
  }
  console.log('Migración terminada sin descuadres.\n');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
