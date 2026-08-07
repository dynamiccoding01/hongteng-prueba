import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';

export const metadata = { title: 'Comisiones · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** VEN-05: comisiones por venta confirmada, agrupadas por vendedor. */
export default async function Comisiones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const desde = typeof crudos['desde'] === 'string' ? crudos['desde'] : undefined;
  const hasta = typeof crudos['hasta'] === 'string' ? crudos['hasta'] : undefined;
  await requerirPermiso('comision.ver');
  const { pagina, porPagina, desde: primera, hasta: ultima } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('v_comisiones')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(primera, ultima);
  // El resumen por vendedor abarca todo el período filtrado, no la página: por
  // eso va aparte y pide solo las dos columnas que necesita para sumar.
  let resumen = supabase.from('v_comisiones').select('vendedor, comision_clp');

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

  const porVendedor = new Map<string, number>();
  for (const f of paraResumen ?? []) {
    porVendedor.set(f.vendedor!, (porVendedor.get(f.vendedor!) ?? 0) + Number(f.comision_clp ?? 0));
  }
  const totalComisiones = (paraResumen ?? []).reduce((s, f) => s + Number(f.comision_clp ?? 0), 0);

  return (
    <>
      <Encabezado
        titulo="Comisiones"
        descripcion={`Comisiones por venta confirmada (VEN-05) · $ ${numero(totalComisiones)} CLP`}
      />

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
        <Vacio>
          No hay comisiones en el período. Se generan al confirmar una venta con vendedor asignado.
        </Vacio>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium">Por vendedor</h2>
            <Tabla>
              <thead>
                <tr>
                  <Th>Vendedor</Th>
                  <Th numerico>Comisión CLP</Th>
                </tr>
              </thead>
              <tbody>
                {[...porVendedor.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([nombre, total]) => (
                    <tr key={nombre}>
                      <Td>{nombre}</Td>
                      <Td numerico>$ {numero(total)}</Td>
                    </tr>
                  ))}
              </tbody>
            </Tabla>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">Detalle por venta</h2>
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Vendedor</Th>
                  <Th>Cliente</Th>
                  <Th numerico>%</Th>
                  <Th numerico>Comisión</Th>
                </tr>
              </thead>
              <tbody>
                {(filas ?? []).map((f) => (
                  <tr key={f.venta_id}>
                    <Td tenue>{fecha(f.fecha!)}</Td>
                    <Td>{f.vendedor}</Td>
                    <Td tenue>{f.cliente}</Td>
                    <Td numerico tenue>
                      {numero(f.comision_porcentaje)}
                    </Td>
                    <Td numerico>$ {numero(f.comision_clp)}</Td>
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
