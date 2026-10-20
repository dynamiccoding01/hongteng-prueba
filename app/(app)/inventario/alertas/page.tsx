import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { SelectorArticulo } from '@/components/selector-articulo';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { fijarStockMinimo } from './acciones';

export const metadata = { title: 'Alertas de stock · Inventario' };

/** INV-05: artículos en o bajo su stock mínimo, y definición del mínimo. */
export default async function AlertasDeStock({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('stock.ver');
  const puedeEditar = usuario.permisos.has('producto.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [{ data: alertas, count, error }, { count: conMinimo }] = await Promise.all([
    supabase
      .from('v_alertas_stock')
      .select('*', { count: 'exact' })
      .order('codigo')
      .range(desde, hasta),
    // Cuántos empaques tienen mínimo definido. Se cuenta en la base: antes se
    // traía el catálogo entero solo para medir el largo de una lista.
    supabase
      .from('producto_variante')
      .select('id, producto:producto_id!inner(activo)', { count: 'exact', head: true })
      .eq('activo', true)
      .eq('producto.activo', true)
      .gt('stock_minimo', 0),
  ]);

  if (error) return <Vacio>No se pudieron cargar las alertas: {error.message}</Vacio>;

  return (
    <>
      <Encabezado
        titulo="Alertas de stock"
        descripcion={`Artículos en o bajo su mínimo (INV-05) · ${numero(conMinimo ?? 0)} con mínimo definido`}
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={fijarStockMinimo} etiquetaNuevo="Definir mínimo">
            <p className="text-sm text-tenue sm:col-span-2">
              El mínimo es por empaque y se mide en empaques. Cuando la existencia total cae en ese
              número o por debajo, aparece en esta lista.
            </p>
            <SelectorArticulo nombre="variante_id" requerido ancho="completo" />
            <Campo
              etiqueta="Stock mínimo"
              nombre="stock_minimo"
              tipo="number"
              requerido
              ejemplo="5"
              minimo={0}
              maximo={99999999}
              ayuda="En empaques. 0 quita la alerta"
            />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(alertas ?? []).length === 0 ? (
        <Vacio>
          Ningún artículo está bajo su mínimo.
          {(conMinimo ?? 0) === 0
            ? ' Todavía no se ha definido ningún mínimo: use «Definir mínimo» para la primera alerta.'
            : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Artículo</Th>
              <Th>Categoría</Th>
              <Th numerico>Stock actual</Th>
              <Th numerico>Mínimo</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {(alertas ?? []).map((a) => {
              const agotado = Number(a.cantidad) === 0;
              return (
                <tr key={a.variante_id}>
                  <Td>
                    <code className="text-xs">{a.codigo}</code>
                    <span className="ml-2 text-xs text-zinc-500">
                      {numero(a.unidades_por_caja)} u/caja
                    </span>
                  </Td>
                  <Td tenue>{a.categoria}</Td>
                  <Td numerico>{numero(a.cantidad)}</Td>
                  <Td numerico tenue>
                    {numero(a.stock_minimo)}
                  </Td>
                  <Td>
                    <Etiqueta tono="ambar">{agotado ? 'AGOTADO' : 'Bajo mínimo'}</Etiqueta>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
