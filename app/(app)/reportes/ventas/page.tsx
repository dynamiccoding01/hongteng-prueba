import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';

export const metadata = { title: 'Ventas por período · Inventario' };

/** REP-05: ventas confirmadas por cliente y producto en un rango de fechas. */
export default async function VentasPorPeriodo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const desde = typeof crudos['desde'] === 'string' ? crudos['desde'] : undefined;
  const hasta = typeof crudos['hasta'] === 'string' ? crudos['hasta'] : undefined;
  const usuario = await requerirPermiso('reporte.ver');
  const puedeExportar = usuario.permisos.has('reporte.exportar');
  const { pagina, porPagina, desde: primera, hasta: ultima } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('v_ventas_detalle')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(primera, ultima);
  // Los resúmenes por cliente y por producto son del período completo, no de la
  // página: consulta aparte con solo las columnas que se agregan.
  let resumen = supabase.from('v_ventas_detalle').select('cliente, producto, cajas, monto_clp');

  if (desde) {
    consulta = consulta.gte('fecha', desde);
    resumen = resumen.gte('fecha', desde);
  }
  if (hasta) {
    consulta = consulta.lte('fecha', hasta);
    resumen = resumen.lte('fecha', hasta);
  }

  const [{ data: filas, count, error }, { data: paraResumen }] = await Promise.all([
    consulta,
    resumen,
  ]);

  if (error) return <Vacio>No se pudo cargar el reporte: {error.message}</Vacio>;

  const porCliente = new Map<string, { cajas: number; monto: number }>();
  const porProducto = new Map<string, { cajas: number; monto: number }>();
  for (const f of paraResumen ?? []) {
    const c = porCliente.get(f.cliente!) ?? { cajas: 0, monto: 0 };
    c.cajas += Number(f.cajas);
    c.monto += Number(f.monto_clp ?? 0);
    porCliente.set(f.cliente!, c);

    const p = porProducto.get(f.producto!) ?? { cajas: 0, monto: 0 };
    p.cajas += Number(f.cajas);
    p.monto += Number(f.monto_clp ?? 0);
    porProducto.set(f.producto!, p);
  }
  const totalMonto = (paraResumen ?? []).reduce((s, f) => s + Number(f.monto_clp ?? 0), 0);

  const parametros = new URLSearchParams();
  if (desde) parametros.set('desde', desde);
  if (hasta) parametros.set('hasta', hasta);

  return (
    <>
      <Encabezado
        titulo="Ventas por período"
        descripcion={`Ventas confirmadas por cliente y producto (REP-05) · $ ${numero(totalMonto)} CLP`}
      >
        {puedeExportar ? (
          <a
            href={`/api/exportar?tipo=ventas&${parametros.toString()}`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Exportar a Excel
          </a>
        ) : null}
      </Encabezado>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filtrar
        </button>
      </form>

      {(filas ?? []).length === 0 ? (
        <Vacio>No hay ventas confirmadas en el período.</Vacio>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium">Por cliente</h2>
            <Tabla>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th numerico>Cajas</Th>
                  <Th numerico>Monto CLP</Th>
                </tr>
              </thead>
              <tbody>
                {[...porCliente.entries()]
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([nombre, t]) => (
                    <tr key={nombre}>
                      <Td>{nombre}</Td>
                      <Td numerico>{numero(t.cajas)}</Td>
                      <Td numerico>$ {numero(t.monto)}</Td>
                    </tr>
                  ))}
              </tbody>
            </Tabla>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">Por producto</h2>
            <Tabla>
              <thead>
                <tr>
                  <Th>Artículo</Th>
                  <Th numerico>Cajas</Th>
                  <Th numerico>Monto CLP</Th>
                </tr>
              </thead>
              <tbody>
                {[...porProducto.entries()]
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([codigo, t]) => (
                    <tr key={codigo}>
                      <Td>
                        <code className="text-xs">{codigo}</code>
                      </Td>
                      <Td numerico>{numero(t.cajas)}</Td>
                      <Td numerico>$ {numero(t.monto)}</Td>
                    </tr>
                  ))}
              </tbody>
            </Tabla>
          </section>
        </div>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
