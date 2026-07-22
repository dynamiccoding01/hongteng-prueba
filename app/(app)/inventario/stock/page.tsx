import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Buscador } from '@/components/buscador';

export const metadata = { title: 'Stock por zona · Inventario' };

const LIMITE = 500;

/**
 * INV-01: existencias por producto y por zona, en cajas y unidades a la vez.
 * A diferencia del buscador (REP-03), aquí cada fila es una combinación
 * artículo × zona: es la vista del bodeguero parado frente a la estantería.
 */
export default async function StockPorZona({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  await requerirPermiso('stock.ver');

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('stock')
    .select(
      'id, cajas, unidades, zona:zona_id!inner(codigo, bodega:bodega_id(codigo)), variante:variante_id!inner(unidades_por_caja, producto:producto_id!inner(codigo, rango_tallas, categoria:categoria_id(nombre_es)))',
    )
    .gt('cajas', 0)
    .limit(LIMITE);

  if (q) consulta = consulta.ilike('variante.producto.codigo', `%${q}%`);

  const { data: filas, error } = await consulta;

  if (error) return <Vacio>No se pudo consultar el stock: {error.message}</Vacio>;

  const ordenadas = (filas ?? []).sort(
    (a, b) =>
      a.variante.producto.codigo.localeCompare(b.variante.producto.codigo) ||
      a.zona.codigo.localeCompare(b.zona.codigo),
  );

  const totalCajas = ordenadas.reduce((s, f) => s + Number(f.cajas), 0);
  const totalUnidades = ordenadas.reduce((s, f) => s + Number(f.unidades), 0);

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
                <Th>Categoría</Th>
                <Th>Tallas</Th>
                <Th>Bodega</Th>
                <Th>Zona</Th>
                <Th numerico>Por caja</Th>
                <Th numerico>Cajas</Th>
                <Th numerico>Unidades</Th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <tr key={f.id}>
                  <Td>
                    <code className="text-xs">{f.variante.producto.codigo}</code>
                  </Td>
                  <Td tenue>{f.variante.producto.categoria?.nombre_es ?? '—'}</Td>
                  <Td tenue>{f.variante.producto.rango_tallas ?? '—'}</Td>
                  <Td tenue>{f.zona.bodega?.codigo ?? '—'}</Td>
                  <Td>
                    <code className="text-xs">{f.zona.codigo}</code>
                  </Td>
                  <Td numerico tenue>
                    {numero(f.variante.unidades_por_caja)}
                  </Td>
                  <Td numerico>{numero(f.cajas)}</Td>
                  <Td numerico>{numero(f.unidades)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>

          <p className="mt-4 text-sm text-zinc-500">
            {numero(ordenadas.length)} {ordenadas.length === 1 ? 'ubicación' : 'ubicaciones'} ·{' '}
            {numero(totalCajas)} cajas · {numero(totalUnidades)} unidades
            {ordenadas.length === LIMITE ? ' · mostrando las primeras ' + LIMITE : ''}
          </p>
        </>
      )}
    </>
  );
}
