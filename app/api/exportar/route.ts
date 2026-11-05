import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
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

/**
 * Cuántas filas se piden en cada vuelta.
 *
 * PostgREST corta cada respuesta en `db-max-rows` (1000 por defecto) **sin
 * decirlo**, y un `.limit(10000)` no pasa por encima de ese tope. Así que el
 * arreglo de X-04 se quedaba a medias: un reporte de 1.001 a 10.000 líneas
 * pasaba la comprobación del total y salía con mil, que es el fallo R-01 por
 * otra puerta. Ahora se pide por tramos hasta tenerlas todas, y si al final no
 * son las que dijo el conteo no se genera el archivo.
 */
const TRAMO = 1000;

type Fila = Record<string, unknown>;

/** Una página de la consulta, con o sin conteo. */
type Pagina = (
  desde: number,
  hasta: number,
) => PromiseLike<{ data: Fila[] | null; count: number | null; error: PostgrestError | null }>;

type Resultado = { filas: Fila[] } | { error: string; status: number };

/**
 * Trae la consulta entera, por tramos.
 *
 * La consulta tiene que venir ordenada por una clave única al final: si dos
 * filas empatan en el orden, la base puede devolverlas en distinto orden en
 * cada tramo, y una fila sale dos veces mientras otra no sale.
 */
async function traerTodo(pagina: Pagina): Promise<Resultado> {
  const primera = await pagina(0, TRAMO - 1);
  if (primera.error) return fallo(primera.error);

  const total = primera.count ?? 0;
  if (total > LIMITE_FILAS) {
    return {
      error:
        `El reporte tiene ${total} líneas y la exportación admite ${LIMITE_FILAS}. ` +
        'Acote el período y vuelva a exportar: un archivo recortado se leería como el total.',
      status: 400,
    };
  }

  const filas = [...(primera.data ?? [])];
  while (filas.length < total) {
    const siguiente = await pagina(filas.length, filas.length + TRAMO - 1);
    if (siguiente.error) return fallo(siguiente.error);
    if (!siguiente.data || siguiente.data.length === 0) break;
    filas.push(...siguiente.data);
  }

  if (filas.length !== total) {
    return {
      error:
        'El reporte cambió mientras se exportaba y el archivo no quedaría completo. Vuelva a exportar.',
      status: 409,
    };
  }

  return { filas };
}

/**
 * El detalle de PostgREST va al log del servidor, no al navegador: es jerga
 * de PostgreSQL que no le sirve a nadie en bodega y describe el esquema a
 * quien no tiene por qué conocerlo (X-07).
 */
function fallo(error: PostgrestError): Resultado {
  console.error('Exportación fallida:', error.message);
  return { error: 'No se pudo generar el reporte. Inténtelo de nuevo.', status: 500 };
}

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
  /*
   * Exportar es ver el reporte y llevárselo: pide lo mismo que la página más
   * `reporte.exportar`. Antes bastaba `reporte.exportar`, y quien lo tuviera sin
   * `reporte.ver` se llevaba en Excel lo que la pantalla no le enseñaba.
   */
  if (!usuario.permisos.has('reporte.ver') || !usuario.permisos.has('reporte.exportar')) {
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
  if (crudoDesde && crudoHasta && crudoDesde > crudoHasta) {
    return NextResponse.json(
      { error: 'La fecha «desde» es posterior a «hasta»: el período quedaría vacío' },
      { status: 400 },
    );
  }
  const periodo: Periodo = {
    ...(crudoDesde ? { desde: crudoDesde } : {}),
    ...(crudoHasta ? { hasta: crudoHasta } : {}),
  };

  /*
   * Las mismas puertas que las páginas de reportes. Las vistas son
   * `security_invoker`: sin `venta.ver` la RLS devuelve cero filas, y el Excel
   * salía vacío con toda la pinta de «no hubo ventas en el período».
   */
  if (tipo === 'ventas' && !usuario.permisos.has('venta.ver')) {
    return NextResponse.json(
      { error: 'El reporte de ventas necesita el permiso venta.ver' },
      { status: 403 },
    );
  }
  if (tipo === 'compras' && !usuario.permisos.has('reporte_compras.ver')) {
    return NextResponse.json(
      { error: 'El reporte de compras necesita el permiso reporte_compras.ver' },
      { status: 403 },
    );
  }

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

  let pagina: Pagina;
  let nombre: string;

  // Cada orden termina en una clave única (ver `traerTodo`).
  if (tipo === 'estadistica') {
    nombre = 'estadistica-mensual';
    pagina = (desde, hasta) =>
      supabase
        .from('v_salidas_mensuales')
        .select('mes, codigo, categoria, unidades_por_caja, cajas, unidades', {
          count: desde === 0 ? 'exact' : undefined,
        })
        .order('mes', { ascending: false })
        .order('codigo')
        .order('variante_id')
        .range(desde, hasta);
  } else if (tipo === 'valorizacion') {
    nombre = 'valorizacion';
    pagina = (desde, hasta) =>
      supabase
        .from('v_valorizacion')
        .select(
          'codigo, categoria, unidades_por_caja, cantidad, costo_caja, moneda, tipo_cambio, valor_clp',
          { count: desde === 0 ? 'exact' : undefined },
        )
        .gt('cantidad', 0)
        .order('codigo')
        .order('variante_id')
        .range(desde, hasta);
  } else if (tipo === 'ventas') {
    nombre = 'ventas-por-periodo';
    pagina = (desde, hasta) =>
      enPeriodo(
        supabase
          .from('v_ventas_detalle')
          .select(
            'fecha, cliente_codigo, cliente, producto, cajas, precio_caja, descuento, subtotal, moneda, tipo_cambio, descuento_clp, monto_clp',
            { count: desde === 0 ? 'exact' : undefined },
          ),
      )
        .order('fecha', { ascending: false })
        .order('detalle_id')
        .range(desde, hasta);
  } else if (tipo === 'compras') {
    // Por la función y no por la vista: desde 0034 el reporte de compras se pide
    // con `reporte_compras.ver`, que es lo que se comprueba ahí dentro. La vista
    // dependía de `importacion.ver` y eso abría el módulo Compras entero.
    nombre = 'compras-por-periodo';
    pagina = (desde, hasta) =>
      supabase
        .rpc(
          'fn_compras_detalle',
          {
            ...(periodo.desde ? { p_desde: periodo.desde } : {}),
            ...(periodo.hasta ? { p_hasta: periodo.hasta } : {}),
          },
          { count: desde === 0 ? 'exact' : undefined },
        )
        .order('fecha', { ascending: false })
        .order('detalle_id')
        .range(desde, hasta);
  } else {
    return NextResponse.json({ error: 'Tipo de reporte no válido' }, { status: 400 });
  }

  const resultado = await traerTodo(pagina);
  if ('error' in resultado) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }
  const { filas } = resultado;

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
      // Un reporte con costos y clientes no se guarda en cachés intermedias.
      'Cache-Control': 'no-store',
    },
  });
}
