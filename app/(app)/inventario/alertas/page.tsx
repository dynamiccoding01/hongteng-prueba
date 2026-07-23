import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { fijarStockMinimo } from './acciones';

export const metadata = { title: 'Alertas de stock · Inventario' };

/** INV-05: artículos en o bajo su stock mínimo, y definición del mínimo. */
export default async function AlertasDeStock() {
  const usuario = await requerirPermiso('stock.ver');
  const puedeEditar = usuario.permisos.has('producto.editar');

  const supabase = await crearClienteServidor();

  const [{ data: alertas, error }, { data: variantes }] = await Promise.all([
    supabase.from('v_alertas_stock').select('*').order('codigo'),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, stock_minimo, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
  ]);

  if (error) return <Vacio>No se pudieron cargar las alertas: {error.message}</Vacio>;

  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja (mín. actual: ${numero(v.stock_minimo)})`,
    }));

  const conMinimo = (variantes ?? []).filter((v) => Number(v.stock_minimo) > 0).length;

  return (
    <>
      <Encabezado
        titulo="Alertas de stock"
        descripcion={`Artículos en o bajo su mínimo (INV-05) · ${numero(conMinimo)} con mínimo definido`}
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={fijarStockMinimo} etiquetaNuevo="Definir mínimo">
            <Seleccion
              etiqueta="Artículo"
              nombre="variante_id"
              opciones={opcionesVariante}
              requerido
            />
            <Campo
              etiqueta="Stock mínimo (cajas, 0 = sin alerta)"
              nombre="stock_minimo"
              tipo="number"
              requerido
              ejemplo="5"
            />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(alertas ?? []).length === 0 ? (
        <Vacio>
          Ningún artículo está bajo su mínimo.
          {conMinimo === 0
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
              const agotado = Number(a.cajas) === 0;
              return (
                <tr key={a.variante_id}>
                  <Td>
                    <code className="text-xs">{a.codigo}</code>
                    <span className="ml-2 text-xs text-zinc-500">
                      {numero(a.unidades_por_caja)} u/caja
                    </span>
                  </Td>
                  <Td tenue>{a.categoria}</Td>
                  <Td numerico>{numero(a.cajas)}</Td>
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
    </>
  );
}
