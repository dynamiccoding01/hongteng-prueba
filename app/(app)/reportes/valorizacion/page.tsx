import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

export const metadata = { title: 'Valorización · Inventario' };

/** REP-04: inventario valorizado al último costo de importación, en CLP. */
export default async function Valorizacion() {
  const usuario = await requerirPermiso('reporte.ver');
  const puedeExportar = usuario.permisos.has('reporte.exportar');

  const supabase = await crearClienteServidor();
  const { data: filas, error } = await supabase
    .from('v_valorizacion')
    .select('*')
    .gt('cajas', 0)
    .order('codigo');

  if (error) return <Vacio>No se pudo cargar la valorización: {error.message}</Vacio>;

  const totalValor = (filas ?? []).reduce((s, f) => s + Number(f.valor_clp ?? 0), 0);
  const totalCajas = (filas ?? []).reduce((s, f) => s + Number(f.cajas), 0);
  const sinCosto = (filas ?? []).filter((f) => f.costo_caja === null).length;

  return (
    <>
      <Encabezado
        titulo="Valorización"
        descripcion={`Stock a último costo de importación (REP-04) · ${numero(totalCajas)} cajas · $ ${numero(totalValor)} CLP`}
      >
        {puedeExportar ? (
          <a
            href="/api/exportar?tipo=valorizacion"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Exportar a Excel
          </a>
        ) : null}
      </Encabezado>

      {sinCosto > 0 ? (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
          {numero(sinCosto)} {sinCosto === 1 ? 'artículo' : 'artículos'} sin costo conocido (aún sin
          importación confirmada con costo): no suman al total.
        </p>
      ) : null}

      {(filas ?? []).length === 0 ? (
        <Vacio>No hay stock que valorizar.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Artículo</Th>
              <Th>Categoría</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Último costo caja</Th>
              <Th>Moneda</Th>
              <Th numerico>Valor CLP</Th>
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((f) => (
              <tr key={f.variante_id}>
                <Td>
                  <code className="text-xs">{f.codigo}</code>
                  <span className="ml-2 text-xs text-zinc-500">
                    {numero(f.unidades_por_caja)} u/caja
                  </span>
                </Td>
                <Td tenue>{f.categoria}</Td>
                <Td numerico>{numero(f.cajas)}</Td>
                <Td numerico tenue>
                  {f.costo_caja === null ? '—' : numero(f.costo_caja)}
                </Td>
                <Td>
                  {f.moneda ? (
                    <Etiqueta tono="neutro">
                      {f.moneda}
                      {f.tipo_cambio ? ` · TC ${numero(f.tipo_cambio)}` : ''}
                    </Etiqueta>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td numerico>{f.valor_clp === null ? '—' : `$ ${numero(f.valor_clp)}`}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
