import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { obtenerUsuario, registrarEnBitacora } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * REP-06: exportación de reportes a Excel.
 *   /api/exportar?tipo=estadistica | valorizacion | ventas[&desde=...&hasta=...]
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
  const supabase = await crearClienteServidor();

  let filas: Record<string, unknown>[] = [];
  let nombre = '';

  if (tipo === 'estadistica') {
    const { data, error } = await supabase
      .from('v_salidas_mensuales')
      .select('mes, codigo, categoria, unidades_por_caja, cajas, unidades')
      .order('mes', { ascending: false })
      .order('codigo');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    nombre = 'estadistica-mensual';
  } else if (tipo === 'valorizacion') {
    const { data, error } = await supabase
      .from('v_valorizacion')
      .select(
        'codigo, categoria, unidades_por_caja, cajas, costo_caja, moneda, tipo_cambio, valor_clp',
      )
      .gt('cajas', 0)
      .order('codigo');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    nombre = 'valorizacion';
  } else if (tipo === 'ventas') {
    let consulta = supabase
      .from('v_ventas_detalle')
      .select(
        'fecha, cliente_codigo, cliente, producto, cajas, precio_caja, moneda, tipo_cambio, monto_clp',
      )
      .order('fecha', { ascending: false })
      .limit(10000);
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');
    if (desde) consulta = consulta.gte('fecha', desde);
    if (hasta) consulta = consulta.lte('fecha', hasta);
    const { data, error } = await consulta;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas = data;
    nombre = 'ventas-por-periodo';
  } else {
    return NextResponse.json({ error: 'Tipo de reporte no válido' }, { status: 400 });
  }

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  const contenido = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  await registrarEnBitacora('EXPORTAR', 'reportes', `Reporte ${nombre} (${filas.length} filas)`);

  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(contenido), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}-${fecha}.xlsx"`,
    },
  });
}
