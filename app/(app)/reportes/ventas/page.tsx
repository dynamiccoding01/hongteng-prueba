import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { diaOmitido } from '@/lib/fechas';
import {
  AvisoSinImporte,
  FiltroPeriodo,
  TablaResumen,
  agrupadas,
  totalDelPeriodo,
} from '../resumen';

export const metadata = { title: 'Ventas por período · Inventario' };

/** REP-05: ventas confirmadas por cliente y producto en un rango de fechas. */
export default async function VentasPorPeriodo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  // `diaOmitido` exige que la fecha exista, no solo que tenga la forma: sin
  // esto, `?desde=hola` llegaba a PostgREST y volvía como «invalid input syntax
  // for type date» pintado en la pantalla.
  const desde = diaOmitido(crudos['desde']);
  const hasta = diaOmitido(crudos['hasta']);
  const usuario = await requerirPermiso('reporte.ver');
  const puedeExportar = usuario.permisos.has('reporte.exportar');
  const { pagina, porPagina, desde: primera, hasta: ultima } = leerPaginacion(crudos);

  // `v_ventas_detalle` es security_invoker: sin `venta.ver` la RLS de venta no
  // devuelve una sola fila. Decirlo es mejor que mostrar una tabla vacía, que se
  // leería como «no hubo ventas en el período» —el mismo cuidado que ya tenía el
  // reporte de compras—.
  if (!usuario.permisos.has('venta.ver')) {
    return (
      <>
        <Encabezado titulo="Ventas por período" descripcion="Ventas confirmadas (REP-05)" />
        <Vacio>
          Este reporte lee las ventas confirmadas y su rol no tiene el permiso
          <code className="mx-1 text-xs">venta.ver</code>. Pídalo en Administración › Roles y
          permisos.
        </Vacio>
      </>
    );
  }

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('v_ventas_detalle')
    .select(
      'detalle_id, fecha, cliente, producto, cajas, precio_caja, descuento, subtotal, moneda, monto_clp',
      { count: 'exact' },
    )
    .order('fecha', { ascending: false })
    .order('detalle_id', { ascending: false })
    .range(primera, ultima);

  if (desde) consulta = consulta.gte('fecha', desde);
  if (hasta) consulta = consulta.lte('fecha', hasta);

  /*
   * Los totales del período los agrega la base (migración 0033). Antes se traía
   * el período entero y se sumaba aquí: PostgREST corta esa consulta en
   * `db-max-rows` sin avisar, así que pasadas mil líneas el total del
   * encabezado era un número corto con toda la pinta de estar bien.
   */
  const [detalle, resumen] = await Promise.all([
    consulta,
    supabase.rpc('fn_ventas_resumen', {
      ...(desde ? { p_desde: desde } : {}),
      ...(hasta ? { p_hasta: hasta } : {}),
    }),
  ]);

  // Los dos errores se miran. El del resumen se descartaba, y una consulta que
  // fallaba dejaba la pantalla diciendo «$ 0 CLP», que se lee como «no hubo
  // ventas» en vez de como «no se pudo calcular».
  if (detalle.error || resumen.error) {
    console.error('REP-05 · ventas por período', detalle.error ?? resumen.error);
    return (
      <>
        <Encabezado titulo="Ventas por período" descripcion="Ventas confirmadas (REP-05)" />
        <Vacio>
          No se pudo cargar el reporte. Vuelva a intentarlo; si sigue igual, avise a soporte.
        </Vacio>
      </>
    );
  }

  const filas = detalle.data;
  const resumenFilas = resumen.data ?? [];
  const total = totalDelPeriodo(resumenFilas);
  const porCliente = agrupadas(resumenFilas, 'CLIENTE');
  const porProducto = agrupadas(resumenFilas, 'PRODUCTO');

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);

  return (
    <>
      <Encabezado
        titulo="Ventas por período"
        descripcion={`Ventas confirmadas por cliente y producto (REP-05) · $ ${numero(total.monto_clp)} CLP`}
      >
        {puedeExportar ? (
          <a
            href={`/api/exportar?tipo=ventas&${parametros.toString()}`}
            className="rounded-md border border-borde px-4 py-2 text-sm"
          >
            Exportar a Excel
          </a>
        ) : null}
      </Encabezado>

      <FiltroPeriodo desde={desde} hasta={hasta} filas={porPagina} />

      <AvisoSinImporte cuantas={total.sin_importe} que="precio por empaque" />

      {/*
       * El vacío se decide con el período completo, no con la página que se
       * está mirando: en la página 3 de 2 la pantalla decía «no hay ventas en
       * el período» junto a un total que no era cero.
       */}
      {total.lineas === 0 ? (
        <Vacio>No hay ventas confirmadas en el período.</Vacio>
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-2">
            <TablaResumen titulo="Por cliente" encabezado="Cliente" filas={porCliente} />
            <TablaResumen
              titulo="Por producto"
              encabezado="Artículo"
              filas={porProducto}
              comoCodigo
            />
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-medium">Detalle</h2>
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Artículo</Th>
                  <Th numerico>Cajas</Th>
                  <Th numerico>Precio</Th>
                  <Th numerico>Descuento</Th>
                  <Th numerico>Monto CLP</Th>
                </tr>
              </thead>
              <tbody>
                {(filas ?? []).map((f) => (
                  <tr key={f.detalle_id}>
                    <Td>{f.fecha}</Td>
                    <Td>{f.cliente}</Td>
                    <Td>
                      <code className="text-xs">{f.producto}</code>
                    </Td>
                    <Td numerico>{numero(f.cajas)}</Td>
                    <Td numerico>
                      {f.precio_caja === null ? '—' : `${numero(f.precio_caja)} ${f.moneda}`}
                    </Td>
                    <Td numerico>{Number(f.descuento) > 0 ? numero(f.descuento) : '—'}</Td>
                    <Td numerico>{f.monto_clp === null ? '—' : `$ ${numero(f.monto_clp)}`}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </section>
        </>
      )}

      <Paginacion total={detalle.count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
