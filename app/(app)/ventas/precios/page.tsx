import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { SeleccionBuscable } from '@/components/seleccion-buscable';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { asignarListaACliente, crearLista, fijarPrecio } from './acciones';

export const metadata = { title: 'Listas de precios · Inventario' };

/** VEN-04: listas de precios por moneda y su asignación a clientes. */
export default async function ListasDePrecios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('venta.ver');
  const puedeEditar = usuario.permisos.has('precio.editar');

  const crudos = await searchParams;
  const pgListas = leerPaginacion(crudos, 'listas');
  const pgClientes = leerPaginacion(crudos, 'clientes');

  const supabase = await crearClienteServidor();

  const [
    { data: listas, count: totalListas, error },
    { data: monedas },
    { data: variantes },
    { data: clientes, count: totalClientes },
    { data: todasLasListas },
  ] = await Promise.all([
    supabase
      .from('lista_precio')
      .select(
        'id, nombre, activo, moneda:moneda_id(codigo, simbolo), items:lista_precio_item(id, precio_caja, variante:variante_id(unidades_por_caja, producto:producto_id(codigo)))',
        { count: 'exact' },
      )
      .order('nombre')
      .range(pgListas.desde, pgListas.hasta),
    supabase.from('moneda').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
    supabase
      .from('cliente')
      .select('id, codigo, nombre, lista:lista_precio_id(nombre)', { count: 'exact' })
      .eq('activo', true)
      .order('nombre')
      .range(pgClientes.desde, pgClientes.hasta),
    // Opciones del desplegable: todas las listas, no la página que se ve.
    supabase.from('lista_precio').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudieron cargar las listas: {error.message}</Vacio>;

  const opcionesMoneda = (monedas ?? []).map((m) => ({
    valor: m.id,
    texto: `${m.codigo} — ${m.nombre}`,
  }));
  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja`,
    }));
  const opcionesLista = (todasLasListas ?? []).map((l) => ({ valor: l.id, texto: l.nombre }));

  return (
    <>
      <Encabezado
        titulo="Listas de precios"
        descripcion="Precios por caja según lista, y lista asignada por cliente (VEN-04)"
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={crearLista} etiquetaNuevo="Nueva lista">
            <Campo etiqueta="Nombre" nombre="nombre" requerido ejemplo="Mayorista USD" />
            <Seleccion etiqueta="Moneda" nombre="moneda_id" opciones={opcionesMoneda} requerido />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

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
                <span className="text-sm text-zinc-500">
                  {lista.items.length} {lista.items.length === 1 ? 'precio' : 'precios'}
                </span>
                {puedeEditar ? (
                  <div className="ml-auto">
                    <FormularioDesplegable accion={fijarPrecio} etiquetaNuevo="Fijar precio">
                      <input type="hidden" name="lista_id" value={lista.id} />
                      <SeleccionBuscable
                        etiqueta="Artículo"
                        nombre="variante_id"
                        opciones={opcionesVariante}
                        requerido
                      />
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

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium">Lista asignada por cliente</h2>
        {(clientes ?? []).length === 0 ? (
          <Vacio>No hay clientes registrados.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Lista asignada</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {(clientes ?? []).map((c) => (
                <tr key={c.id}>
                  <Td>
                    <code className="text-xs">{c.codigo}</code>
                    <span className="ml-2">{c.nombre}</span>
                  </Td>
                  <Td tenue>{c.lista?.nombre ?? 'sin lista'}</Td>
                  {puedeEditar ? (
                    <Td>
                      <FormularioDesplegable
                        accion={asignarListaACliente}
                        etiquetaNuevo=""
                        esEdicion
                      >
                        <input type="hidden" name="cliente_id" value={c.id} />
                        <Seleccion
                          etiqueta="Lista de precios (vacío = quitar)"
                          nombre="lista_precio_id"
                          opciones={opcionesLista}
                        />
                      </FormularioDesplegable>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}

        <Paginacion
          total={totalClientes ?? 0}
          pagina={pgClientes.pagina}
          porPagina={pgClientes.porPagina}
          prefijo="clientes"
        />
      </section>
    </>
  );
}
