import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

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
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { desde, hasta } = await searchParams;
  await requerirPermiso('comision.ver');

  const supabase = await crearClienteServidor();

  let consulta = supabase.from('v_comisiones').select('*').order('fecha', { ascending: false });
  if (desde) consulta = consulta.gte('fecha', desde);
  if (hasta) consulta = consulta.lte('fecha', hasta);

  const { data: filas, error } = await consulta.limit(1000);

  if (error) return <Vacio>No se pudo cargar el reporte: {error.message}</Vacio>;

  const porVendedor = new Map<string, number>();
  for (const f of filas ?? []) {
    porVendedor.set(f.vendedor!, (porVendedor.get(f.vendedor!) ?? 0) + Number(f.comision_clp ?? 0));
  }
  const totalComisiones = (filas ?? []).reduce((s, f) => s + Number(f.comision_clp ?? 0), 0);

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
    </>
  );
}
