import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Tarjeta, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { SelectorArticulo } from '@/components/selector-articulo';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { crearLista, editarLista, fijarPrecio } from './acciones';

export const metadata = { title: 'Listas de precios · Inventario' };

/**
 * VEN-04: listas de precios por moneda.
 *
 * La lista no se asigna cliente por cliente: mientras haya **una sola activa**,
 * sus precios son los de todos. Asignarla a mano era un paso que nadie
 * recordaba, y el cliente recién creado se quedaba sin precios sin que la
 * pantalla dijera por qué.
 */
export default async function ListasDePrecios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('venta.ver');
  const puedeEditar = usuario.permisos.has('precio.editar');

  const crudos = await searchParams;
  const pgListas = leerPaginacion(crudos, 'listas');

  const supabase = await crearClienteServidor();

  const [{ data: listas, count: totalListas, error }, { data: monedas }, { count: activas }] =
    await Promise.all([
      supabase
        .from('lista_precio')
        .select(
          'id, nombre, activo, moneda:moneda_id(codigo, simbolo), items:lista_precio_item(id, precio_caja, variante:variante_id(unidades_por_caja, producto:producto_id(codigo)))',
          { count: 'exact' },
        )
        .order('nombre')
        .range(pgListas.desde, pgListas.hasta),
      supabase.from('moneda').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      // Cuántas listas activas hay EN TOTAL, no en esta página: de eso depende
      // que los precios salgan solos, y la página solo muestra un trozo.
      supabase.from('lista_precio').select('id', { count: 'exact', head: true }).eq('activo', true),
    ]);

  if (error) return <Vacio>No se pudieron cargar las listas: {error.message}</Vacio>;

  const opcionesMoneda = (monedas ?? []).map((m) => ({
    valor: m.id,
    texto: `${m.codigo} — ${m.nombre}`,
  }));
  return (
    <>
      <Encabezado
        titulo="Listas de precios"
        descripcion="Precios por caja. Con una sola lista activa, sus precios son los de todos los clientes (VEN-04)"
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={crearLista} etiquetaNuevo="Nueva lista">
            <Campo etiqueta="Nombre" nombre="nombre" requerido ejemplo="Mayorista USD" />
            <Seleccion etiqueta="Moneda" nombre="moneda_id" opciones={opcionesMoneda} requerido />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {/*
       * Con una sola lista activa los precios salen solos en toda venta. Con
       * dos, el sistema no adivina cuál aplicar —ni al vender ni al confirmar
       * una importación—, y esa es justo la avería que nadie ve: los precios
       * dejan de publicarse y la pantalla de ventas no dice por qué.
       */}
      {(activas ?? 0) > 1 ? (
        <Tarjeta className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Hay {activas} listas activas. Mientras sean más de una, el sistema no elige entre ellas:
          los precios no saldrán solos al vender, y confirmar una importación tampoco los publicará.
          Deje una sola activa.
        </Tarjeta>
      ) : null}

      {(listas ?? []).length === 0 ? (
        <Vacio>
          No hay listas de precios.
          {puedeEditar ? ' Use «Nueva lista» para crear la primera.' : ''}
        </Vacio>
      ) : (
        <div className="space-y-8">
          {(listas ?? []).map((lista) => (
            <section key={lista.id} className="rounded-xl border border-borde bg-superficie p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold">{lista.nombre}</h2>
                <Etiqueta tono={lista.activo ? 'verde' : 'neutro'}>{lista.moneda.codigo}</Etiqueta>
                {lista.activo ? null : <Etiqueta tono="neutro">Inactiva</Etiqueta>}
                <span className="text-sm text-zinc-500">
                  {lista.items.length} {lista.items.length === 1 ? 'precio' : 'precios'}
                </span>
                {puedeEditar ? (
                  <div className="ml-auto flex items-center gap-2">
                    <FormularioDesplegable accion={editarLista} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="id" value={lista.id} />
                      <Campo etiqueta="Nombre" nombre="nombre" requerido valor={lista.nombre} />
                      <Seleccion
                        etiqueta="Estado"
                        nombre="activo"
                        requerido
                        valor={lista.activo ? '1' : '0'}
                        opciones={[
                          { valor: '1', texto: 'Activa' },
                          { valor: '0', texto: 'Inactiva' },
                        ]}
                      />
                      <p className="text-sm text-tenue sm:col-span-2">
                        Una lista inactiva no se aplica al vender ni recibe los precios de las
                        importaciones. La moneda no se cambia: los precios ya fijados no la llevan
                        escrita, se leen en la de la lista.
                      </p>
                    </FormularioDesplegable>
                    <FormularioDesplegable accion={fijarPrecio} etiquetaNuevo="Fijar precio">
                      <input type="hidden" name="lista_id" value={lista.id} />
                      <SelectorArticulo nombre="variante_id" requerido ancho="completo" />
                      <Campo
                        etiqueta={`Precio por caja (${lista.moneda.codigo})`}
                        nombre="precio_caja"
                        tipo="number"
                        requerido
                        ejemplo="35"
                      />
                    </FormularioDesplegable>
                  </div>
                ) : null}
              </div>

              {lista.items.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin precios todavía.</p>
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Artículo</Th>
                      <Th numerico>Por caja</Th>
                      <Th numerico>Precio caja</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.items
                      .sort((a, b) =>
                        a.variante.producto.codigo.localeCompare(b.variante.producto.codigo),
                      )
                      .map((item) => (
                        <tr key={item.id}>
                          <Td>
                            <code className="text-xs">{item.variante.producto.codigo}</code>
                          </Td>
                          <Td numerico tenue>
                            {numero(item.variante.unidades_por_caja)}
                          </Td>
                          <Td numerico>
                            {lista.moneda.simbolo ?? ''} {numero(item.precio_caja)}
                          </Td>
                        </tr>
                      ))}
                  </tbody>
                </Tabla>
              )}
            </section>
          ))}
        </div>
      )}

      <Paginacion
        total={totalListas ?? 0}
        pagina={pgListas.pagina}
        porPagina={pgListas.porPagina}
        prefijo="listas"
      />
    </>
  );
}
