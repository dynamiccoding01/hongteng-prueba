import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { SeleccionBuscable } from '@/components/seleccion-buscable';
import { CamposDetalleImportacion } from '@/components/campos-importacion';
import type { ZonaOpcion } from '@/components/selector-zona';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { unidadLegible, unidadSingular } from '@/lib/inventario/articulo';
import { preciosLinea } from '@/lib/compras/precios';
import { agregarDetalle, confirmarImportacion, crearImportacion } from './acciones';

export const metadata = { title: 'Importaciones en borrador · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/**
 * COM-01 a COM-03: importaciones en preparación.
 *
 * Solo borradores. Las confirmadas son documentos sellados que ya no se editan
 * y viven en /compras/confirmadas: mezcladas aquí enterraban lo pendiente,
 * porque un borrador de hace semanas queda debajo de todas las importaciones
 * posteriores —casi todas confirmadas— y esta pantalla es justo donde hay que
 * poder verlo para terminarlo.
 */
export default async function Importaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('importacion.ver');
  const puedeCrear = usuario.permisos.has('importacion.crear');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [
    { data: importaciones, count, error },
    { data: proveedores },
    { data: cambioVigente },
    { data: zonas },
  ] = await Promise.all([
    supabase
      .from('importacion')
      .select(
        'id, fecha, documento_aduana, tipo_cambio, notas, proveedor:proveedor_id(nombre), moneda:moneda_id(codigo, simbolo), detalle:importacion_detalle(id, cajas, costo_caja, precio_venta_caja, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, unidad:unidad_medida_id(nombre_es))))',
        { count: 'exact' },
      )
      .eq('estado', 'BORRADOR')
      .order('id', { ascending: false })
      .range(desde, hasta),
    supabase.from('proveedor').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    // El que va a quedar grabado en una importación creada hoy. Ya no se
    // teclea: lo pone `fn_documento_tipo_cambio` desde Maestros › Tipo de
    // cambio, y aquí solo se anuncia para que no sea una sorpresa.
    supabase.rpc('fn_tipo_cambio_vigente', { p_fecha: new Date().toISOString().slice(0, 10) }),
    // Los artículos ya no se precargan: los busca `SelectorArticulo` contra la
    // base mientras se escribe. Las zonas sí, porque son pocas y acotadas.
    // Se ordenan por bodega para que la lista salga ya agrupada por color.
    supabase
      .from('zona')
      .select('id, codigo, bodega:bodega_id(codigo, nombre, color)')
      .eq('activo', true)
      .order('bodega_id')
      .order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar las importaciones: {error.message}</Vacio>;

  const opcionesProveedor = (proveedores ?? []).map((p) => ({
    valor: p.id,
    texto: `${p.codigo} — ${p.nombre}`,
  }));
  const opcionesZona: ZonaOpcion[] = (zonas ?? []).map((z) => ({
    id: z.id,
    codigo: z.codigo,
    bodega: z.bodega?.codigo ?? '—',
    bodegaNombre: z.bodega?.nombre ?? null,
    color: z.bodega?.color ?? 'gris',
  }));

  return (
    <>
      <Encabezado
        titulo="Importaciones en borrador"
        descripcion="Compras en preparación: se editan hasta confirmarlas (COM-01 a COM-03)"
      >
        <Link
          href="/compras/confirmadas"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Ver confirmadas
        </Link>
        {puedeCrear ? (
          <FormularioDesplegable accion={crearImportacion} etiquetaNuevo="Nueva importación">
            <SeleccionBuscable
              etiqueta="Proveedor"
              nombre="proveedor_id"
              opciones={opcionesProveedor}
              requerido
            />
            <Campo etiqueta="Fecha" nombre="fecha" tipo="date" />
            <Campo
              etiqueta="Documento de aduana (traspaso 203)"
              nombre="documento_aduana"
              ejemplo="203-2026-001234"
            />
            <Campo etiqueta="Notas" nombre="notas" ancho="completo" />
            {/*
             * Ni la moneda ni el tipo de cambio se eligen. Se dicen, en vez de
             * dejar un desplegable con una sola opción y un campo que nadie
             * puede contrastar contra nada.
             */}
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-tenue sm:col-span-2 dark:bg-zinc-800">
              Las compras se registran siempre en <strong>dólares (USD)</strong>. De ahí salen el
              costo, el precio de venta y la lista de precios; al vender en pesos, el sistema
              convierte.
              {cambioVigente === null ? (
                <>
                  {' '}
                  <strong>No hay tipo de cambio cargado</strong>, así que esta importación no se va
                  a poder crear: cárguelo en Maestros › Tipo de cambio.
                </>
              ) : (
                <>
                  {' '}
                  Se va a grabar con el dólar a <strong>$ {numero(cambioVigente)}</strong>, para
                  poder valorizar el stock en pesos.
                </>
              )}
            </p>
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(importaciones ?? []).length === 0 ? (
        <Vacio>
          No hay importaciones en borrador.
          {puedeCrear ? ' Use «Nueva importación» para empezar una.' : ''} Las ya confirmadas están
          en <Link href="/compras/confirmadas">Importaciones confirmadas</Link>.
        </Vacio>
      ) : (
        <div className="space-y-8">
          {(importaciones ?? []).map((imp) => {
            const totalCajas = imp.detalle.reduce((s, d) => s + Number(d.cajas), 0);
            // El costo del borrador, antes de confirmar. Confirmar es
            // irreversible —genera el kardex y sella el documento—, así que la
            // cifra tiene que estar a la vista antes, no solo después.
            const sinCosto = imp.detalle.some((d) => d.costo_caja === null);
            const totalCosto = imp.detalle.reduce(
              (s, d) => s + Number(d.cajas) * Number(d.costo_caja ?? 0),
              0,
            );
            return (
              <section key={imp.id} className="rounded-xl border border-borde bg-superficie p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold">Importación #{imp.id}</h2>
                  <Etiqueta tono="ambar">Borrador</Etiqueta>
                  <span className="text-sm text-zinc-500">
                    {fecha(imp.fecha)} · {imp.proveedor.nombre} · {imp.moneda.codigo}
                    {imp.tipo_cambio ? ` (TC ${numero(imp.tipo_cambio)})` : ''}
                    {imp.documento_aduana ? ` · doc ${imp.documento_aduana}` : ''}
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">
                    {numero(totalCajas)} cajas
                    {imp.detalle.length > 0 ? (
                      <>
                        {' · '}
                        {imp.moneda.simbolo ?? ''} {numero(totalCosto)} {imp.moneda.codigo}
                        {sinCosto ? (
                          <span className="ml-1">
                            <Etiqueta tono="ambar">parcial</Etiqueta>
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </div>

                {imp.detalle.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin detalle todavía.</p>
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Artículo</Th>
                        <Th>Zona destino</Th>
                        <Th numerico>Cantidad</Th>
                        <Th numerico>Precio de compra</Th>
                        <Th numerico>Precio de venta</Th>
                        <Th numerico>Margen</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {imp.detalle.map((d) => {
                        const unidad = unidadSingular(d.variante.producto.unidad?.nombre_es ?? '');
                        const p = preciosLinea(
                          d.costo_caja,
                          d.precio_venta_caja,
                          d.variante.unidades_por_caja,
                          imp.moneda.simbolo,
                          unidad,
                        );
                        return (
                          <tr key={d.id}>
                            <Td>
                              <code className="text-xs">{d.variante.producto.codigo}</code>
                              <span className="ml-2 text-xs text-zinc-500">
                                {numero(d.variante.unidades_por_caja)}{' '}
                                {unidadLegible(d.variante.producto.unidad?.nombre_es ?? '')} por
                                caja
                              </span>
                            </Td>
                            <Td>
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <DistintivoBodega
                                  codigo={d.zona.bodega?.codigo ?? '—'}
                                  color={d.zona.bodega?.color}
                                  titulo={d.zona.bodega?.nombre}
                                />
                                <code className="text-xs">{d.zona.codigo}</code>
                              </span>
                            </Td>
                            <Td numerico>
                              {numero(d.cajas)}
                              <span className="block text-xs text-tenue">
                                {numero(Number(d.cajas) * Number(d.variante.unidades_por_caja))}{' '}
                                {unidadLegible(d.variante.producto.unidad?.nombre_es ?? '')}
                              </span>
                            </Td>
                            <Td numerico>
                              {p.compra}
                              <span className="block text-xs text-tenue">{p.compraUnidad}</span>
                            </Td>
                            <Td numerico>
                              {p.venta}
                              <span className="block text-xs text-tenue">{p.ventaUnidad}</span>
                            </Td>
                            <Td numerico tenue>
                              {p.margen}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabla>
                )}

                {puedeCrear ? (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <FormularioDesplegable accion={agregarDetalle} etiquetaNuevo="Agregar detalle">
                      <input type="hidden" name="importacion_id" value={imp.id} />
                      <CamposDetalleImportacion zonas={opcionesZona} moneda={imp.moneda.codigo} />
                    </FormularioDesplegable>

                    {imp.detalle.length > 0 ? (
                      <FormularioDesplegable
                        accion={confirmarImportacion}
                        etiquetaNuevo="Confirmar e ingresar a stock"
                      >
                        <input type="hidden" name="importacion_id" value={imp.id} />
                        <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                          Se generará una ENTRADA por cada línea del detalle ({numero(totalCajas)}{' '}
                          cajas, {imp.moneda.simbolo ?? ''} {numero(totalCosto)} {imp.moneda.codigo}
                          {sinCosto ? ' —hay líneas sin costo—' : ''}) y la importación quedará
                          sellada. Esta acción no se puede deshacer desde aquí.
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

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
