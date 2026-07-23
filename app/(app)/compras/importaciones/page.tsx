import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { SeleccionBuscable } from '@/components/seleccion-buscable';
import { agregarDetalle, confirmarImportacion, crearImportacion } from './acciones';

export const metadata = { title: 'Importaciones · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** COM-01 a COM-03: importaciones con detalle e ingreso a stock al confirmar. */
export default async function Importaciones() {
  const usuario = await requerirPermiso('importacion.ver');
  const puedeCrear = usuario.permisos.has('importacion.crear');

  const supabase = await crearClienteServidor();

  const [
    { data: importaciones, error },
    { data: proveedores },
    { data: monedas },
    { data: variantes },
    { data: zonas },
  ] = await Promise.all([
    supabase
      .from('importacion')
      .select(
        'id, fecha, documento_aduana, tipo_cambio, estado, notas, proveedor:proveedor_id(nombre), moneda:moneda_id(codigo, simbolo), detalle:importacion_detalle(id, cajas, costo_caja, zona:zona_id(codigo), variante:variante_id(unidades_por_caja, producto:producto_id(codigo)))',
      )
      .order('id', { ascending: false })
      .limit(50),
    supabase.from('proveedor').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    supabase.from('moneda').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
    supabase.from('zona').select('id, codigo').eq('activo', true).order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar las importaciones: {error.message}</Vacio>;

  const opcionesProveedor = (proveedores ?? []).map((p) => ({
    valor: p.id,
    texto: `${p.codigo} — ${p.nombre}`,
  }));
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
  const opcionesZona = (zonas ?? []).map((z) => ({ valor: z.id, texto: z.codigo }));

  return (
    <>
      <Encabezado
        titulo="Importaciones"
        descripcion="Compras por proveedor con ingreso a stock al confirmar (COM-01 a COM-03)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={crearImportacion} etiquetaNuevo="Nueva importación">
            <SeleccionBuscable
              etiqueta="Proveedor"
              nombre="proveedor_id"
              opciones={opcionesProveedor}
              requerido
            />
            <Seleccion etiqueta="Moneda" nombre="moneda_id" opciones={opcionesMoneda} requerido />
            <Campo etiqueta="Tipo de cambio a CLP" nombre="tipo_cambio" tipo="number" />
            <Campo etiqueta="Fecha" nombre="fecha" tipo="date" />
            <Campo
              etiqueta="Documento de aduana (traspaso 203)"
              nombre="documento_aduana"
              ejemplo="203-2026-001234"
            />
            <Campo etiqueta="Notas" nombre="notas" ancho="completo" />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(importaciones ?? []).length === 0 ? (
        <Vacio>
          No hay importaciones registradas.
          {puedeCrear ? ' Use «Nueva importación» para crear el primer borrador.' : ''}
        </Vacio>
      ) : (
        <div className="space-y-8">
          {(importaciones ?? []).map((imp) => {
            const totalCajas = imp.detalle.reduce((s, d) => s + Number(d.cajas), 0);
            const esBorrador = imp.estado === 'BORRADOR';
            return (
              <section
                key={imp.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold">Importación #{imp.id}</h2>
                  <Etiqueta tono={esBorrador ? 'ambar' : 'verde'}>
                    {esBorrador ? 'Borrador' : 'Confirmada'}
                  </Etiqueta>
                  <span className="text-sm text-zinc-500">
                    {fecha(imp.fecha)} · {imp.proveedor.nombre} · {imp.moneda.codigo}
                    {imp.tipo_cambio ? ` (TC ${numero(imp.tipo_cambio)})` : ''}
                    {imp.documento_aduana ? ` · doc ${imp.documento_aduana}` : ''}
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">{numero(totalCajas)} cajas</span>
                </div>

                {imp.detalle.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin detalle todavía.</p>
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Artículo</Th>
                        <Th>Zona destino</Th>
                        <Th numerico>Cajas</Th>
                        <Th numerico>Costo por caja</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {imp.detalle.map((d) => (
                        <tr key={d.id}>
                          <Td>
                            <code className="text-xs">{d.variante.producto.codigo}</code>
                            <span className="ml-2 text-xs text-zinc-500">
                              {numero(d.variante.unidades_por_caja)} u/caja
                            </span>
                          </Td>
                          <Td tenue>{d.zona.codigo}</Td>
                          <Td numerico>{numero(d.cajas)}</Td>
                          <Td numerico tenue>
                            {d.costo_caja === null
                              ? '—'
                              : `${imp.moneda.simbolo ?? ''} ${numero(d.costo_caja)}`}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}

                {esBorrador && puedeCrear ? (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <FormularioDesplegable accion={agregarDetalle} etiquetaNuevo="Agregar detalle">
                      <input type="hidden" name="importacion_id" value={imp.id} />
                      <SeleccionBuscable
                        etiqueta="Artículo"
                        nombre="variante_id"
                        opciones={opcionesVariante}
                        requerido
                      />
                      <SeleccionBuscable
                        etiqueta="Zona destino"
                        nombre="zona_id"
                        opciones={opcionesZona}
                        requerido
                      />
                      <Campo etiqueta="Cajas" nombre="cajas" tipo="number" requerido ejemplo="10" />
                      <Campo
                        etiqueta={`Costo por caja (${imp.moneda.codigo})`}
                        nombre="costo_caja"
                        tipo="number"
                      />
                    </FormularioDesplegable>

                    {imp.detalle.length > 0 ? (
                      <FormularioDesplegable
                        accion={confirmarImportacion}
                        etiquetaNuevo="Confirmar e ingresar a stock"
                      >
                        <input type="hidden" name="importacion_id" value={imp.id} />
                        <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                          Se generará una ENTRADA por cada línea del detalle ({numero(totalCajas)}{' '}
                          cajas en total) y la importación quedará sellada. Esta acción no se puede
                          deshacer desde aquí.
                        </p>
                      </FormularioDesplegable>
                    ) : null}
                  </div>
                ) : null}

                {imp.notas ? <p className="mt-3 text-sm text-zinc-500">{imp.notas}</p> : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
