import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { obtenerUsuario, registrarEnBitacora } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { esDia } from '@/lib/fechas';

export const dynamic = 'force-dynamic';

/**
 * Cuántas filas se admiten en una exportación.
 *
 * El tope existía antes como un `.limit(10000)` a secas, que es lo peor de los
 * dos mundos: recortaba el archivo sin decirlo y quien lo abría lo leía como el
 * período completo. Ahora se cuenta primero y, si no cabe, se explica y no se
 * genera nada: un Excel corto que parece entero es un error que sale del
 * sistema y sigue circulando por correo.
 */
const LIMITE_FILAS = 10_000;

/** Rango de fechas del reporte, ya validado. */
interface Periodo {
  desde?: string;
  hasta?: string;
}

/** Cómo se describe el período en la bitácora, para poder reconstruirlo. */
function periodoLegible({ desde, hasta }: Periodo): string {
  if (desde && hasta) return `del ${desde} al ${hasta}`;
  if (desde) return `desde el ${desde}`;
  if (hasta) return `hasta el ${hasta}`;
  return 'sin filtro de fechas';
}

/**
 * REP-06: exportación de reportes a Excel.
 *   /api/exportar?tipo=estadistica | valorizacion | ventas | compras[&desde=...&hasta=...]
 * Exige reporte.exportar y deja rastro EXPORTAR en la bitácora (ADM-02).
 */
export async function GET(peticion: Request): Promise<Response> {
  const usuario = await obtenerUsuario();
  if (!usuario) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (!usuario.permisos.has('reporte.exportar')) {
    return NextResponse.json({ error: 'Sin permiso para exportar' }, { status: 403 });
  }

  const url = new URL(peticion.url);
  const tipo = url.searchParams.get('tipo');

  // Las fechas se validan aquí y no se dejan pasar a PostgREST: un `?desde=hola`
  // volvía como «invalid input syntax for type date» en un JSON de error 500.
  const crudoDesde = url.searchParams.get('desde');
  const crudoHasta = url.searchParams.get('hasta');
  if ((crudoDesde && !esDia(crudoDesde)) || (crudoHasta && !esDia(crudoHasta))) {
    return NextResponse.json(
      { error: 'Las fechas se escriben aaaa-mm-dd y tienen que existir' },
      { status: 400 },
    );
  }
  const periodo: Periodo = {
    ...(crudoDesde ? { desde: crudoDesde } : {}),
    ...(crudoHasta ? { hasta: crudoHasta } : {}),
  };

  const supabase = await crearClienteServidor();

  /** Aplica el período a una consulta que filtre por la columna `fecha`. */
  const enPeriodo = <
    T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T },
  >(
    consulta: T,
  ): T => {
    let filtrada = consulta;
    if (periodo.desde) filtrada = filtrada.gte('fecha', periodo.desde);
    if (periodo.hasta) filtrada = filtrada.lte('fecha', periodo.hasta);
    return filtrada;
  };

  let filas: Record<string, unknown>[] = [];
  let total: number | null = null;
  let nombre = '';

  if (tipo === 'estadistica') {
    const { data, count, error } = await supabase
      .from('v_salidas_mensuales')
      .select('mes, codigo, categoria, unidades_por_caja, cajas, unidades', { count: 'exact' })
      .order('mes', { ascending: false })
      .order('codigo')
      .limit(LIMITE_FILAS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    total = count;
    nombre = 'estadistica-mensual';
  } else if (tipo === 'valorizacion') {
    const { data, count, error } = await supabase
      .from('v_valorizacion')
      .select(
        'codigo, categoria, unidades_por_caja, cantidad, costo_caja, moneda, tipo_cambio, valor_clp',
        { count: 'exact' },
      )
      .gt('cantidad', 0)
      .order('codigo')
      .limit(LIMITE_FILAS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    total = count;
    nombre = 'valorizacion';
  } else if (tipo === 'ventas') {
    const { data, count, error } = await enPeriodo(
      supabase
        .from('v_ventas_detalle')
        .select(
          'fecha, cliente_codigo, cliente, producto, cajas, precio_caja, descuento, subtotal, moneda, tipo_cambio, descuento_clp, monto_clp',
          { count: 'exact' },
        ),
    )
      .order('fecha', { ascending: false })
      .limit(LIMITE_FILAS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    total = count;
    nombre = 'ventas-por-periodo';
  } else if (tipo === 'compras') {
    const { data, count, error } = await enPeriodo(
      supabase
        .from('v_compras_detalle')
        .select(
          'fecha, documento_aduana, proveedor_codigo, proveedor, producto, cajas, costo_caja, precio_venta_caja, subtotal, moneda, tipo_cambio, monto_clp',
          { count: 'exact' },
        ),
    )
      .order('fecha', { ascending: false })
      .limit(LIMITE_FILAS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    total = count;
    nombre = 'compras-por-periodo';
  } else {
    return NextResponse.json({ error: 'Tipo de reporte no válido' }, { status: 400 });
  }

  if (total !== null && total > LIMITE_FILAS) {
    return NextResponse.json(
      {
        error:
          `El reporte tiene ${total} líneas y la exportación admite ${LIMITE_FILAS}. ` +
          'Acote el período y vuelva a exportar: un archivo recortado se leería como el total.',
      },
      { status: 400 },
    );
  }

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  const contenido = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  // El período va en la bitácora: sin él, el registro dice que salió un reporte
  // pero no cuál, y un archivo que circula fuera del sistema no se puede
  // reconstruir después.
  await registrarEnBitacora(
    'EXPORTAR',
    'reportes',
    `Reporte ${nombre} ${periodoLegible(periodo)} (${filas.length} filas)`,
  );

  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(contenido), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}-${fecha}.xlsx"`,
    },
  });
}
