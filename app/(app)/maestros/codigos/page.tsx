import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { Buscador } from '@/components/buscador';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { actualizarCodigos } from './acciones';

export const metadata = { title: 'Códigos de barras · Inventario' };

/** INV-08: código de barras / SKU interno por empaque, para lectura rápida. */
export default async function Codigos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const q = typeof crudos['q'] === 'string' ? crudos['q'] : undefined;
  const usuario = await requerirPermiso('producto.ver');
  const puedeEditar = usuario.permisos.has('producto.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  // El orden va en la consulta, no en TypeScript: ordenar después de `.range()`
  // solo reordenaría las filas que tocaron esta página.
  let consulta = supabase
    .from('producto_variante')
    .select(
      'id, unidades_por_caja, codigo_barras, sku_interno, producto:producto_id!inner(codigo, activo)',
      { count: 'exact' },
    )
    .eq('activo', true)
    .eq('producto.activo', true)
    .order('producto(codigo)')
    .order('unidades_por_caja')
    .range(desde, hasta);

  // Los que faltan por asignar se cuentan en la base de datos sobre todo el
  // filtro, no sobre la página: es el número que dice cuánto trabajo queda.
  let pendientes = supabase
    .from('producto_variante')
    .select('id, producto:producto_id!inner(codigo, activo)', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('producto.activo', true)
    .is('codigo_barras', null)
    .is('sku_interno', null);

  if (q) {
    consulta = consulta.ilike('producto.codigo', `%${q}%`);
    pendientes = pendientes.ilike('producto.codigo', `%${q}%`);
  }

  const [{ data: variantes, count, error }, { count: sinCodigo }] = await Promise.all([
    consulta,
    pendientes,
  ]);

  if (error) return <Vacio>No se pudieron cargar los empaques: {error.message}</Vacio>;

  const ordenadas = variantes ?? [];

  return (
    <>
      <Encabezado
        titulo="Códigos de barras"
        descripcion={`Código de barras y SKU por empaque (INV-08) · ${numero(sinCodigo ?? 0)} sin asignar`}
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
      </Encabezado>

      {ordenadas.length === 0 ? (
        <Vacio>
          {q ? (
            <>
              Ningún empaque coincide con <strong>{q}</strong>.
            </>
          ) : (
            <>Todavía no hay empaques registrados.</>
          )}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Artículo</Th>
              <Th numerico>Por caja</Th>
              <Th>Código de barras</Th>
              <Th>SKU interno</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((v) => (
              <tr key={v.id}>
                <Td>
                  <code className="text-xs">{v.producto.codigo}</code>
                </Td>
                <Td numerico tenue>
                  {numero(v.unidades_por_caja)}
                </Td>
                <Td tenue>{v.codigo_barras ?? <Etiqueta tono="ambar">sin asignar</Etiqueta>}</Td>
                <Td tenue>{v.sku_interno ?? '—'}</Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={actualizarCodigos} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="variante_id" value={v.id} />
                      <p className="text-sm text-tenue sm:col-span-2">
                        Artículo <code className="text-xs">{v.producto.codigo}</code>, caja de{' '}
                        {numero(v.unidades_por_caja)}.
                      </p>
                      <Campo
                        etiqueta="Código de barras"
                        nombre="codigo_barras"
                        valor={v.codigo_barras}
                        ejemplo="7801234567890"
                        largoMax={40}
                        patron="[0-9A-Za-z\-]+"
                        transformar="codigo"
                        ayuda="Solo números, letras y guiones"
                      />
                      <Campo
                        etiqueta="SKU interno"
                        nombre="sku_interno"
                        valor={v.sku_interno}
                        ejemplo="B7577E-48"
                        largoMax={40}
                        patron="[0-9A-Za-z\-]+"
                        transformar="codigo"
                        ayuda="Solo números, letras y guiones"
                      />
                    </FormularioDesplegable>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
