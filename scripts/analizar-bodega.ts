/**
 * Diagnostico previo a la migracion (ADM-04).
 *
 * NO escribe nada en la base de datos. Lee BODEGA.xls, valida contra los totales
 * declarados por el cliente y reporta que filas necesitan revision humana.
 *
 *   npx tsx scripts/analizar-bodega.ts [ruta/al/BODEGA.xls]
 */

import {
  HOJAS_DETALLE,
  TOTALES_ESPERADOS,
  leerPlanilla,
  type FilaPlanilla,
  type HojaDetalle,
} from '../lib/bodega/leer-planilla';
import { parseZona } from '../lib/bodega/parse-zona';

const ruta = process.argv[2] ?? process.env.BODEGA_XLS_PATH ?? './datos/BODEGA.xls';

function clasificarRepetidos(filas: FilaPlanilla[]) {
  const porCodigo = new Map<string, FilaPlanilla[]>();
  for (const f of filas) {
    const lista = porCodigo.get(f.codigo) ?? [];
    lista.push(f);
    porCodigo.set(f.codigo, lista);
  }

  const variantes: string[] = [];
  const multiZona: string[] = [];
  const duplicados: string[] = [];

  for (const [codigo, lista] of porCodigo) {
    if (lista.length === 1) continue;
    const empaques = new Set(lista.map((f) => f.unidadesPorCaja));
    if (empaques.size > 1) {
      variantes.push(codigo);
    } else if (new Set(lista.map((f) => f.zonaCruda)).size > 1) {
      multiZona.push(codigo);
    } else {
      duplicados.push(codigo);
    }
  }

  return { variantes, multiZona, duplicados };
}

function main() {
  console.log(`\nLeyendo ${ruta}\n`);
  const porHoja = leerPlanilla(ruta);

  let totalFilas = 0;
  let totalOk = 0;
  let totalNoReconcilia = 0;
  const excepciones: { hoja: HojaDetalle; fila: number; codigo: string; motivo: string }[] = [];
  let descuadres = 0;

  for (const hoja of HOJAS_DETALLE) {
    const filas = porHoja.get(hoja) ?? [];
    const entradas = filas.reduce((s, f) => s + f.entradas, 0);
    const existencia = filas.reduce((s, f) => s + f.existencia, 0);
    const esperado = TOTALES_ESPERADOS[hoja];

    let okZona = 0;
    let noReconcilia = 0;
    for (const f of filas) {
      // Regla del negocio: 实存 = 入库 - 出库
      if (Math.abs(f.entradas - f.salidas - f.existencia) > 0.01) descuadres++;

      const r = parseZona(f.zonaCruda, f.existencia);
      if (r.ok) {
        okZona++;
        if (!r.reconcilia) {
          noReconcilia++;
          totalNoReconcilia++;
        }
      } else {
        excepciones.push({ hoja, fila: f.fila, codigo: f.codigo, motivo: r.motivo });
      }
    }

    const { variantes, multiZona, duplicados } = clasificarRepetidos(filas);
    const cuadra =
      entradas === esperado.entradas && existencia === esperado.existencia ? 'OK' : 'NO CUADRA';

    console.log(`── ${hoja}`);
    console.log(`   filas .............. ${filas.length}`);
    console.log(
      `   entradas ........... ${entradas} (esperado ${esperado.entradas})   ` +
        `existencia: ${existencia} (esperado ${esperado.existencia})  → ${cuadra}`,
    );
    console.log(
      `   zonas parseadas .... ${okZona}/${filas.length} ` +
        `(${((okZona / filas.length) * 100).toFixed(1)}%) · ` +
        `de esas, ${noReconcilia} con cantidades que no cuadran con 实存`,
    );
    console.log(
      `   codigos repetidos .. variantes de empaque: ${variantes.length} · ` +
        `en varias zonas: ${multiZona.length} · duplicados exactos: ${duplicados.length}`,
    );
    console.log('');

    totalFilas += filas.length;
    totalOk += okZona;
  }

  console.log('═'.repeat(72));
  console.log(`TOTAL filas: ${totalFilas}`);
  console.log(
    `Zonas parseadas automaticamente: ${totalOk}/${totalFilas} ` +
      `(${((totalOk / totalFilas) * 100).toFixed(1)}%)`,
  );
  console.log(`Filas con 实存 != 入库 - 出库: ${descuadres}`);
  console.log(`Filas parseadas pero con anotaciones desactualizadas: ${totalNoReconcilia}`);
  console.log(`Filas que NO se pueden parsear (revision humana): ${excepciones.length}`);

  const porMotivo = new Map<string, number>();
  for (const e of excepciones) {
    const clave = e.motivo.split(':')[0] ?? e.motivo;
    porMotivo.set(clave, (porMotivo.get(clave) ?? 0) + 1);
  }
  console.log('\nExcepciones por motivo:');
  for (const [motivo, cantidad] of [...porMotivo].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(cantidad).padStart(5)}  ${motivo}`);
  }

  console.log('\nPrimeras 15 excepciones:');
  for (const e of excepciones.slice(0, 15)) {
    console.log(`  ${e.hoja}:${e.fila}  ${e.codigo.padEnd(14)}  ${e.motivo}`);
  }
  console.log('');
}

main();
