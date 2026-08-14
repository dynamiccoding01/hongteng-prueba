import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Buscador } from '@/components/buscador';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { estiloBodega } from '@/lib/colores-bodega';

export const metadata = { title: 'Stock por zona · Inventario' };

/**
 * INV-01: existencias por producto y por zona, en cajas y unidades a la vez.
 * A diferencia del buscador (REP-03), aquí cada fila es una combinación
 * artículo × zona: es la vista del bodeguero parado frente a la estantería.
 */
export default async function StockPorZona({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const q = typeof crudos['q'] === 'string' ? crudos['q'] : undefined;
  await requerirPermiso('stock.ver');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('stock')
    .select(
      'id, cantidad, total_unidades, zona:zona_id!inner(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id!inner(unidades_por_caja, producto:producto_id!inner(codigo, descripcion_es, rango_tallas, categoria:categoria_id(nombre_es), unidad:unidad_medida_id(nombre_es)))',
      { count: 'exact' },
    )
    .gt('cantidad', 0)
    // El orden va en la base de datos, no en TypeScript: ordenar después de
    // paginar solo reordenaría la página que tocó, no el listado.
    .order('zona_id')
    .order('variante_id')
    .range(desde, hasta);

  if (q) consulta = consulta.ilike('variante.producto.codigo', `%${q}%`);

  const { data: filas, count, error } = await consulta;

  if (error) return <Vacio>No se pudo consultar el stock: {error.message}</Vacio>;

  const ordenadas = filas ?? [];
  const totalCantidad = ordenadas.reduce((s, f) => s + Number(f.cantidad), 0);
  const totalUnidades = ordenadas.reduce((s, f) => s + Number(f.total_unidades), 0);

  return (
    <>
      <Encabezado
        titulo="Stock por zona"
        descripcion="Existencia física por artículo y ubicación (INV-01)"
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
      </Encabezado>

      {ordenadas.length === 0 ? (
        <Vacio>
          {q ? (
            <>
              Ningún artículo con stock coincide con <strong>{q}</strong>.
            </>
          ) : (
            <>
              Todavía no hay existencias. Se cargarán al migrar <code>BODEGA.xls</code>.
            </>
          )}
        </Vacio>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Artículo</Th>
                <Th>Categoría</Th>
                <Th>Tallas</Th>
                <Th>Bodega · Zona</Th>
                <Th>Se cuenta en</Th>
                <Th numerico>Cantidad unidades</Th>
                <Th numerico>Cantidad</Th>
                <Th numerico>Total unidades</Th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <tr key={f.id}>
                  <Td className={`border-l-4 ${estiloBodega(f.zona.bodega?.color).borde}`}>
                    <code className="text-xs">{f.variante.producto.codigo}</code>
                  </Td>
                  <Td>{f.variante.producto.descripcion_es ?? '—'}</Td>
                  <Td tenue>{f.variante.producto.categoria?.nombre_es ?? '—'}</Td>
                  <Td tenue>{f.variante.producto.rango_tallas ?? '—'}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <DistintivoBodega
                        codigo={f.zona.bodega?.codigo ?? '—'}
                        color={f.zona.bodega?.color}
                        titulo={f.zona.bodega?.nombre}
                      />
                      <code className="text-xs">{f.zona.codigo}</code>
                    </span>
                  </Td>
                  <Td tenue>{f.variante.producto.unidad?.nombre_es ?? '—'}</Td>
                  <Td numerico tenue>
                    {numero(f.variante.unidades_por_caja)}
                  </Td>
                  <Td numerico>{numero(f.cantidad)}</Td>
                  <Td numerico>{numero(f.total_unidades)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>

          {/* Los totales son de esta página, no del listado completo: sumar
              todo exigiría traerlo entero, que es justo lo que evita paginar. */}
          <p className="mt-4 text-sm text-zinc-500">
            En esta página: {numero(totalCantidad)} de cantidad · {numero(totalUnidades)} unidades
            en total
          </p>
        </>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
