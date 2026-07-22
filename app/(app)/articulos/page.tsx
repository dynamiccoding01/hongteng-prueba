import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Buscador } from '@/components/buscador';

export const metadata = { title: 'Buscar artículos · Inventario' };

/**
 * REP-03: buscador global con existencia y ubicación.
 * Es el equivalente a la hoja «buscador» de BODEGA.xls, pero con el stock
 * repartido por zona en vez de una cadena de texto libre.
 */
export default async function Articulos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  await requerirPermiso('stock.ver');

  const supabase = await crearClienteServidor();

  let consulta = supabase.from('v_stock_variante').select('*').order('codigo').limit(200);

  if (q) consulta = consulta.ilike('codigo', `%${q}%`);

  const { data: articulos, error } = await consulta;

  if (error) return <Vacio>No se pudo consultar el stock: {error.message}</Vacio>;

  return (
    <>
      <Encabezado
        titulo="Buscar artículos"
        descripcion="Existencia y ubicación por artículo (REP-03)"
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
      </Encabezado>

      {(articulos ?? []).length === 0 ? (
        <Vacio>
          {q ? (
            <>
              Ningún artículo coincide con <strong>{q}</strong>.
            </>
          ) : (
            <>
              Todavía no hay existencias. Se cargarán al migrar <code>BODEGA.xls</code>.
            </>
          )}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Categoría</Th>
              <Th>Tallas</Th>
              <Th numerico>Por caja</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
              <Th>Ubicación</Th>
            </tr>
          </thead>
          <tbody>
            {(articulos ?? []).map((a) => (
              <tr key={a.variante_id}>
                <Td>
                  <code className="text-xs">{a.codigo}</code>
                </Td>
                <Td tenue>{a.categoria}</Td>
                <Td tenue>{a.rango_tallas ?? '—'}</Td>
                <Td numerico tenue>
                  {numero(a.unidades_por_caja)}
                </Td>
                <Td numerico>{numero(a.cajas)}</Td>
                <Td numerico>{numero(a.unidades)}</Td>
                <Td tenue>{a.zonas ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
