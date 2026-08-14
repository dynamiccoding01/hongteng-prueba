import { Fragment } from 'react';
import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { unidadSingular } from '@/lib/inventario/articulo';
import { preciosLinea } from '@/lib/compras/precios';
import { Filtros } from './filtros';

export const metadata = { title: 'Importaciones confirmadas · Inventario' };

/** Cuántas columnas tiene la tabla: lo necesita el `colSpan` del detalle. */
const COLUMNAS = 9;

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

function fechaHora(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(valor),
  );
}

/** Un texto de `searchParams`, o cadena vacía si no vino o vino repetido. */
function texto(crudos: Record<string, string | string[] | undefined>, clave: string): string {
  const valor = crudos[clave];
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * COM-03 · Historial de importaciones confirmadas.
 *
 * Separada de /compras/importaciones a propósito. Aquella es una mesa de
 * trabajo: borradores que se están armando y que se confirman. Esta es archivo:
 * documentos sellados que ya no se tocan —lo impide
 * `tr_importacion_confirmada_inmutable`— y que se consultan para responder
 * «¿cuándo entró esto, de quién y a qué costo?».
 *
 * Mezcladas en un solo listado por id descendente, el archivo entierra la mesa
 * de trabajo: como casi toda importación acaba confirmada, un borrador de hace
 * semanas —justo el que falta terminar— queda debajo de todas las confirmadas
 * posteriores, y a las pocas páginas ya no se ve. La lista con la que se
 * trabaja no puede crecer con lo que ya está terminado.
 *
 * Reutiliza el permiso `importacion.ver`: es exactamente la misma información
 * que ya se veía, filtrada. Un permiso nuevo obligaría a una migración y a
 * concederlo a los roles, sin proteger nada que no estuviera ya protegido.
 */
export default async function ImportacionesConfirmadas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('importacion.ver');

  const crudos = await searchParams;
  const desdeF = texto(crudos, 'desde');
  const hastaF = texto(crudos, 'hasta');
  const proveedorF = texto(crudos, 'proveedor');
  const documentoF = texto(crudos, 'documento');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('importacion')
    .select(
      'id, fecha, documento_aduana, tipo_cambio, notas, confirmada_en, proveedor:proveedor_id(nombre), moneda:moneda_id(codigo, simbolo), confirmada:confirmada_por(nombre), detalle:importacion_detalle(id, cajas, costo_caja, precio_venta_caja, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, descripcion_es, unidad:unidad_medida_id(nombre_es))))',
      { count: 'exact' },
    )
    .eq('estado', 'CONFIRMADA')
    // El orden va en la base: ordenar después de paginar solo reordenaría la
    // página que tocó. Por fecha y, dentro del día, por número descendente.
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (desdeF) consulta = consulta.gte('fecha', desdeF);
  if (hastaF) consulta = consulta.lte('fecha', hastaF);
  if (proveedorF) consulta = consulta.eq('proveedor_id', Number(proveedorF));
  if (documentoF) consulta = consulta.ilike('documento_aduana', `%${documentoF}%`);

  const [{ data: importaciones, count, error }, { data: proveedores }] = await Promise.all([
    consulta,
    supabase.from('proveedor').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudo cargar el historial: {error.message}</Vacio>;

  const filas = importaciones ?? [];
  const hayFiltro = Boolean(desdeF || hastaF || proveedorF || documentoF);

  /**
   * Costo de una importación en su moneda y su equivalente en pesos.
   *
   * El tipo de cambio se guarda en la cabecera, no se lee de la tabla
   * `tipo_cambio`: es el del día del documento y el costeo no debe moverse si
   * esa tabla se corrige después. Una importación en CLP no necesita
   * conversión; una en otra moneda sin tipo de cambio no se puede convertir, y
   * eso se dice en vez de inventar un número.
   */
  function costos(imp: (typeof filas)[number]) {
    const completo = imp.detalle.every((d) => d.costo_caja !== null);
    const total = imp.detalle.reduce((s, d) => s + Number(d.cajas) * Number(d.costo_caja ?? 0), 0);
    const clp =
      imp.moneda.codigo === 'CLP'
        ? total
        : imp.tipo_cambio
          ? total * Number(imp.tipo_cambio)
          : null;
    return { total, clp, completo };
  }

  const totalPaginaClp = filas.reduce((s, imp) => s + (costos(imp).clp ?? 0), 0);
  const totalPaginaCajas = filas.reduce(
    (s, imp) => s + imp.detalle.reduce((t, d) => t + Number(d.cajas), 0),
    0,
  );

  return (
    <>
      <Encabezado
        titulo="Importaciones confirmadas"
        descripcion={`Historial de compras ya ingresadas a stock (COM-03) · ${numero(count ?? 0)} ${
          (count ?? 0) === 1 ? 'importación' : 'importaciones'
        }`}
      >
        <Link
          href="/compras/importaciones"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Ver borradores
        </Link>
      </Encabezado>

      <Filtros
        desde={desdeF}
        hasta={hastaF}
        proveedorId={proveedorF}
        documento={documentoF}
        proveedores={proveedores ?? []}
        porPagina={porPagina}
      />

      {filas.length === 0 ? (
        <Vacio>
          {hayFiltro
            ? 'Ninguna importación confirmada coincide con los filtros.'
            : 'Todavía no hay importaciones confirmadas. Aparecerán aquí en cuanto se confirme el primer borrador.'}
        </Vacio>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Fecha</Th>
                <Th>Proveedor</Th>
                <Th>Documento de aduana</Th>
                <Th numerico>Líneas</Th>
                <Th numerico>Cajas</Th>
                <Th numerico>Costo</Th>
                <Th numerico>Equivalente en pesos</Th>
                <Th>Confirmada</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((imp) => {
                const { total, clp, completo } = costos(imp);
                const cajas = imp.detalle.reduce((s, d) => s + Number(d.cajas), 0);
                return (
                  <Fragment key={imp.id}>
                    <tr>
                      <Td>
                        <code className="text-xs">#{imp.id}</code>
                      </Td>
                      <Td>{fecha(imp.fecha)}</Td>
                      <Td>{imp.proveedor.nombre}</Td>
                      <Td tenue>
                        {imp.documento_aduana ? (
                          <code className="text-xs">{imp.documento_aduana}</code>
                        ) : (
                          <Etiqueta tono="ambar">sin documento</Etiqueta>
                        )}
                      </Td>
                      <Td numerico tenue>
                        {numero(imp.detalle.length)}
                      </Td>
                      <Td numerico>{numero(cajas)}</Td>
                      <Td numerico>
                        {imp.moneda.simbolo ?? ''} {numero(total)}{' '}
                        <span className="text-xs text-tenue">{imp.moneda.codigo}</span>
                        {/* Un costo incompleto se avisa: sumar solo las líneas
                            que traen precio daría un total menor y creíble. */}
                        {completo ? null : (
                          <span className="ml-1">
                            <Etiqueta tono="ambar">parcial</Etiqueta>
                          </span>
                        )}
                      </Td>
                      <Td numerico>
                        {clp === null ? (
                          <span
                            className="text-xs text-tenue"
                            title="La importación no registró tipo de cambio, así que no se puede convertir"
                          >
                            sin tipo de cambio
                          </span>
                        ) : (
                          <>
                            $ {numero(Math.round(clp))}
                            {imp.tipo_cambio ? (
                              <span className="block text-xs text-tenue">
                                TC {numero(imp.tipo_cambio)}
                              </span>
                            ) : null}
                          </>
                        )}
                      </Td>
                      <Td tenue>
                        {/* Quién y cuándo la selló. La base ya lo guardaba
                            (`confirmada_por`, `confirmada_en`) y no se veía. */}
                        <span className="whitespace-nowrap">{imp.confirmada?.nombre ?? '—'}</span>
                        {imp.confirmada_en ? (
                          <span className="block text-xs whitespace-nowrap text-tenue">
                            {fechaHora(imp.confirmada_en)}
                          </span>
                        ) : null}
                      </Td>
                    </tr>

                    {/*
                     * El detalle va plegado: una importación puede traer muchas
                     * líneas y este listado es para recorrer el historial, no
                     * para leerlas todas a la vez. `<details>` lo resuelve sin
                     * JavaScript ni estado de cliente.
                     */}
                    <tr>
                      <Td columnas={COLUMNAS}>
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-tenue hover:text-acento">
                            Ver el detalle de {numero(imp.detalle.length)}{' '}
                            {imp.detalle.length === 1 ? 'línea' : 'líneas'}
                            {imp.notas ? ' y las notas' : ''}
                          </summary>

                          <div className="mt-3 overflow-x-auto rounded-lg border border-borde">
                            <table className="w-full text-sm">
                              <thead>
                                <tr>
                                  <Th>Artículo</Th>
                                  <Th>Destino</Th>
                                  <Th numerico>Cajas</Th>
                                  <Th numerico>Unidades</Th>
                                  <Th numerico>Precio de compra</Th>
                                  <Th numerico>Precio de venta</Th>
                                  <Th numerico>Margen</Th>
                                  <Th numerico>Subtotal</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {imp.detalle.map((d) => {
                                  const p = preciosLinea(
                                    d.costo_caja,
                                    d.precio_venta_caja,
                                    d.variante.unidades_por_caja,
                                    imp.moneda.simbolo,
                                    unidadSingular(d.variante.producto.unidad?.nombre_es ?? ''),
                                  );
                                  return (
                                    <tr key={d.id}>
                                      <Td>
                                        <code className="text-xs">
                                          {d.variante.producto.codigo}
                                        </code>
                                        {d.variante.producto.descripcion_es ? (
                                          <span className="ml-2 text-xs text-tenue">
                                            {d.variante.producto.descripcion_es}
                                          </span>
                                        ) : null}
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
                                      <Td numerico>{numero(d.cajas)}</Td>
                                      <Td numerico tenue>
                                        {numero(
                                          Number(d.cajas) * Number(d.variante.unidades_por_caja),
                                        )}
                                      </Td>
                                      <Td numerico>
                                        {p.compra}
                                        <span className="block text-xs text-tenue">
                                          {p.compraUnidad}
                                        </span>
                                      </Td>
                                      <Td numerico>
                                        {p.venta}
                                        <span className="block text-xs text-tenue">
                                          {p.ventaUnidad}
                                        </span>
                                      </Td>
                                      <Td numerico tenue>
                                        {p.margen}
                                      </Td>
                                      <Td numerico>
                                        {d.costo_caja === null
                                          ? '—'
                                          : `${imp.moneda.simbolo ?? ''} ${numero(
                                              Number(d.cajas) * Number(d.costo_caja),
                                            )}`}
                                      </Td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {imp.notas ? (
                            <p className="mt-2 text-xs text-tenue">{imp.notas}</p>
                          ) : null}
                        </details>
                      </Td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </Tabla>

          {/* Totales de esta página, no del historial completo: sumarlo entero
              exigiría traerlo entero, que es justo lo que evita paginar. */}
          <p className="mt-4 text-sm text-zinc-500">
            En esta página: {numero(totalPaginaCajas)} cajas · ${' '}
            {numero(Math.round(totalPaginaClp))} en pesos
          </p>
        </>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
