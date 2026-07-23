import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { agregarConteo, aplicarToma, crearToma } from './acciones';

export const metadata = { title: 'Toma de inventario · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** INV-06: toma de inventario físico, con ajuste automático de diferencias. */
export default async function TomaDeInventario() {
  const usuario = await requerirPermiso('toma.ver');
  const puedeCrear = usuario.permisos.has('toma.crear');

  const supabase = await crearClienteServidor();

  const [{ data: tomas, error }, { data: bodegas }, { data: variantes }, { data: zonas }] =
    await Promise.all([
      supabase
        .from('toma_inventario')
        .select(
          'id, fecha, estado, notas, bodega:bodega_id(codigo, nombre), detalle:toma_inventario_detalle(id, cajas_contadas, zona:zona_id(id, codigo), variante:variante_id(id, unidades_por_caja, producto:producto_id(codigo)))',
        )
        .order('id', { ascending: false })
        .limit(30),
      supabase.from('bodega').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      supabase
        .from('producto_variante')
        .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
        .eq('activo', true)
        .eq('producto.activo', true)
        .limit(1000),
      supabase.from('zona').select('id, codigo').eq('activo', true).order('codigo'),
    ]);

  if (error) return <Vacio>No se pudieron cargar las tomas: {error.message}</Vacio>;

  const { data: stock } = await supabase.from('stock').select('variante_id, zona_id, cajas');
  const stockPorClave = new Map(
    (stock ?? []).map((s) => [`${s.variante_id}-${s.zona_id}`, Number(s.cajas)]),
  );

  const opcionesBodega = (bodegas ?? []).map((b) => ({
    valor: b.id,
    texto: `${b.codigo} — ${b.nombre}`,
  }));
  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja`,
    }));
  const opcionesZona = (zonas ?? []).map((z) => ({ valor: z.id, texto: z.codigo }));

  return (
    <>
      <Encabezado
        titulo="Toma de inventario"
        descripcion="Conteo físico por zona; al aplicar, la diferencia se ajusta sola (INV-06)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={crearToma} etiquetaNuevo="Nueva toma">
            <Seleccion etiqueta="Bodega" nombre="bodega_id" opciones={opcionesBodega} requerido />
            <Campo etiqueta="Fecha" nombre="fecha" tipo="date" />
            <Campo etiqueta="Notas" nombre="notas" ancho="completo" />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(tomas ?? []).length === 0 ? (
        <Vacio>
          No hay tomas de inventario.
          {puedeCrear ? ' Use «Nueva toma» para empezar el conteo.' : ''}
        </Vacio>
      ) : (
        <div className="space-y-8">
          {(tomas ?? []).map((toma) => {
            const esBorrador = toma.estado === 'BORRADOR';
            return (
              <section
                key={toma.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold">Toma #{toma.id}</h2>
                  <Etiqueta tono={esBorrador ? 'ambar' : 'verde'}>
                    {esBorrador ? 'Borrador' : 'Aplicada'}
                  </Etiqueta>
                  <span className="text-sm text-zinc-500">
                    {fecha(toma.fecha)} · {toma.bodega.codigo} — {toma.bodega.nombre}
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">
                    {toma.detalle.length} {toma.detalle.length === 1 ? 'conteo' : 'conteos'}
                  </span>
                </div>

                {toma.detalle.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin conteos todavía.</p>
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Artículo</Th>
                        <Th>Zona</Th>
                        <Th numerico>Sistema</Th>
                        <Th numerico>Contado</Th>
                        <Th numerico>Diferencia</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {toma.detalle.map((d) => {
                        const sistema = stockPorClave.get(`${d.variante.id}-${d.zona.id}`) ?? 0;
                        const diferencia = Number(d.cajas_contadas) - sistema;
                        return (
                          <tr key={d.id}>
                            <Td>
                              <code className="text-xs">{d.variante.producto.codigo}</code>
                            </Td>
                            <Td tenue>{d.zona.codigo}</Td>
                            <Td numerico tenue>
                              {esBorrador ? numero(sistema) : '—'}
                            </Td>
                            <Td numerico>{numero(d.cajas_contadas)}</Td>
                            <Td numerico>
                              {esBorrador ? (
                                diferencia === 0 ? (
                                  <span className="text-zinc-400">cuadra</span>
                                ) : (
                                  <Etiqueta tono={diferencia > 0 ? 'verde' : 'ambar'}>
                                    {diferencia > 0 ? '+' : ''}
                                    {numero(diferencia)}
                                  </Etiqueta>
                                )
                              ) : (
                                '—'
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabla>
                )}

                {esBorrador && puedeCrear ? (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <FormularioDesplegable accion={agregarConteo} etiquetaNuevo="Registrar conteo">
                      <input type="hidden" name="toma_id" value={toma.id} />
                      <Seleccion
                        etiqueta="Artículo"
                        nombre="variante_id"
                        opciones={opcionesVariante}
                        requerido
                      />
                      <Seleccion
                        etiqueta="Zona"
                        nombre="zona_id"
                        opciones={opcionesZona}
                        requerido
                      />
                      <Campo
                        etiqueta="Cajas contadas"
                        nombre="cajas_contadas"
                        tipo="number"
                        requerido
                        ejemplo="0"
                      />
                    </FormularioDesplegable>

                    {toma.detalle.length > 0 ? (
                      <FormularioDesplegable accion={aplicarToma} etiquetaNuevo="Aplicar toma">
                        <input type="hidden" name="toma_id" value={toma.id} />
                        <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                          Se generará un ajuste por cada diferencia contra el stock del sistema y la
                          toma quedará sellada. No se puede deshacer desde aquí.
                        </p>
                      </FormularioDesplegable>
                    ) : null}
                  </div>
                ) : null}

                {toma.notas ? <p className="mt-3 text-sm text-zinc-500">{toma.notas}</p> : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
