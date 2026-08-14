import { Fragment } from 'react';
import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { unidadLegible } from '@/lib/inventario/articulo';
import { Filtros } from './filtros';

export const metadata = { title: 'Ventas confirmadas · Inventario' };

/** Cuántas columnas tiene la tabla: lo necesita el `colSpan` del detalle. */
const COLUMNAS = 10;

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

function texto(crudos: Record<string, string | string[] | undefined>, clave: string): string {
  const valor = crudos[clave];
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * VEN-02 · Historial de ventas confirmadas.
 *
 * Separada de /ventas/notas por lo mismo que en compras: una venta confirmada
 * ya generó sus SALIDAS y quedó sellada por `tr_venta_confirmada_inmutable`.
 * Es archivo, no mesa de trabajo, y mezclarlas entierra los borradores que sí
 * hay que terminar.
 *
 * Reutiliza `venta.ver`: la misma información que ya se veía, filtrada.
 */
export default async function VentasConfirmadas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('venta.ver');

  const crudos = await searchParams;
  const desdeF = texto(crudos, 'desde');
  const hastaF = texto(crudos, 'hasta');
  const clienteF = texto(crudos, 'cliente');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('venta')
    .select(
      'id, folio, fecha, tipo_cambio, notas, confirmada_en, comision_clp, comision_porcentaje, cliente:cliente_id(nombre), moneda:moneda_id(codigo, simbolo), vendedor:vendedor_id(usuario:usuario_id(nombre)), confirmada:confirmada_por(nombre), detalle:venta_detalle(id, cajas, precio_caja, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, descripcion_es, unidad:unidad_medida_id(nombre_es))))',
      { count: 'exact' },
    )
    .eq('estado', 'CONFIRMADA')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (desdeF) consulta = consulta.gte('fecha', desdeF);
  if (hastaF) consulta = consulta.lte('fecha', hastaF);
  if (clienteF) consulta = consulta.eq('cliente_id', Number(clienteF));

  const [{ data: ventas, count, error }, { data: clientes }] = await Promise.all([
    consulta,
    supabase.from('cliente').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudo cargar el historial: {error.message}</Vacio>;

  const filas = ventas ?? [];
  const hayFiltro = Boolean(desdeF || hastaF || clienteF);

  /**
   * Monto de la venta en su moneda y su equivalente en pesos.
   *
   * El tipo de cambio es el guardado en la venta, no el de la tabla
   * `tipo_cambio`: es el pactado ese día y no debe moverse después. Una venta
   * en CLP no necesita conversión; una en otra moneda sin tipo de cambio no se
   * puede convertir, y se dice en vez de inventar un número.
   */
  function montos(v: (typeof filas)[number]) {
    const completo = v.detalle.every((d) => d.precio_caja !== null);
    const total = v.detalle.reduce((s, d) => s + Number(d.cajas) * Number(d.precio_caja ?? 0), 0);
    const clp =
      v.moneda.codigo === 'CLP' ? total : v.tipo_cambio ? total * Number(v.tipo_cambio) : null;
    return { total, clp, completo };
  }

  const totalPaginaClp = filas.reduce((s, v) => s + (montos(v).clp ?? 0), 0);
  const totalPaginaCajas = filas.reduce(
    (s, v) => s + v.detalle.reduce((t, d) => t + Number(d.cajas), 0),
    0,
  );

  return (
    <>
      <Encabezado
        titulo="Ventas confirmadas"
        descripcion={`Historial de ventas ya descontadas de stock (VEN-02) · ${numero(count ?? 0)} ${
          (count ?? 0) === 1 ? 'venta' : 'ventas'
        }`}
      >
        <Link
          href="/ventas/notas"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Ver borradores
        </Link>
      </Encabezado>

      <Filtros
        desde={desdeF}
        hasta={hastaF}
        clienteId={clienteF}
        clientes={clientes ?? []}
        porPagina={porPagina}
      />

      {filas.length === 0 ? (
        <Vacio>
          {hayFiltro
            ? 'Ninguna venta confirmada coincide con los filtros.'
            : 'Todavía no hay ventas confirmadas. Aparecerán aquí en cuanto se confirme el primer borrador.'}
        </Vacio>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Vendedor</Th>
                <Th numerico>Líneas</Th>
                <Th numerico>Cajas</Th>
                <Th numerico>Total</Th>
                <Th numerico>Equivalente en pesos</Th>
                <Th>Confirmada</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((v) => {
                const { total, clp, completo } = montos(v);
                const cajas = v.detalle.reduce((s, d) => s + Number(d.cajas), 0);
                return (
                  <Fragment key={v.id}>
                    <tr>
                      {/*
                       * El folio manda sobre el id: es el número que va en el
                       * papel y el que el cliente va a nombrar por teléfono. El
                       * id queda debajo porque es con el que se busca aquí
                       * dentro.
                       */}
                      <Td>
                        <code className="text-xs font-semibold">{v.folio ?? '—'}</code>
                        <span className="block text-xs text-tenue">#{v.id}</span>
                      </Td>
                      <Td>{fecha(v.fecha)}</Td>
                      <Td>{v.cliente.nombre}</Td>
                      <Td tenue>
                        {v.vendedor?.usuario.nombre ?? '—'}
                        {v.comision_clp !== null ? (
                          <span className="block text-xs text-tenue">
                            comisión {numero(v.comision_porcentaje)} % · $ {numero(v.comision_clp)}
                          </span>
                        ) : null}
                      </Td>
                      <Td numerico tenue>
                        {numero(v.detalle.length)}
                      </Td>
                      <Td numerico>{numero(cajas)}</Td>
                      <Td numerico>
                        {v.moneda.simbolo ?? ''} {numero(total)}{' '}
                        <span className="text-xs text-tenue">{v.moneda.codigo}</span>
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
                            title="La venta no registró tipo de cambio, así que no se puede convertir"
                          >
                            sin tipo de cambio
                          </span>
                        ) : (
                          <>
                            $ {numero(Math.round(clp))}
                            {v.tipo_cambio ? (
                              <span className="block text-xs text-tenue">
                                TC {numero(v.tipo_cambio)}
                              </span>
                            ) : null}
                          </>
                        )}
                      </Td>
                      <Td tenue>
                        <span className="whitespace-nowrap">{v.confirmada?.nombre ?? '—'}</span>
                        {v.confirmada_en ? (
                          <span className="block text-xs whitespace-nowrap text-tenue">
                            {fechaHora(v.confirmada_en)}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <a
                          href={`/imprimir/venta/${v.id}`}
                          target="_blank"
                          rel="noopener"
                          className="text-sm whitespace-nowrap text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          Imprimir
                        </a>
                      </Td>
                    </tr>

                    <tr>
                      <Td columnas={COLUMNAS}>
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-tenue hover:text-acento">
                            Ver el detalle de {numero(v.detalle.length)}{' '}
                            {v.detalle.length === 1 ? 'línea' : 'líneas'}
                            {v.notas ? ' y las notas' : ''}
                          </summary>

                          <div className="mt-3 overflow-x-auto rounded-lg border border-borde">
                            <table className="w-full text-sm">
                              <thead>
                                <tr>
                                  <Th>Artículo</Th>
                                  <Th>Despachado desde</Th>
                                  <Th numerico>Cajas</Th>
                                  <Th numerico>Unidades</Th>
                                  <Th numerico>Precio por caja</Th>
                                  <Th numerico>Subtotal</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {v.detalle.map((d) => (
                                  <tr key={d.id}>
                                    <Td>
                                      <code className="text-xs">{d.variante.producto.codigo}</code>
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
                                      )}{' '}
                                      {unidadLegible(d.variante.producto.unidad?.nombre_es ?? '')}
                                    </Td>
                                    <Td numerico tenue>
                                      {d.precio_caja === null
                                        ? '—'
                                        : `${v.moneda.simbolo ?? ''} ${numero(d.precio_caja)}`}
                                    </Td>
                                    <Td numerico>
                                      {d.precio_caja === null
                                        ? '—'
                                        : `${v.moneda.simbolo ?? ''} ${numero(
                                            Number(d.cajas) * Number(d.precio_caja),
                                          )}`}
                                    </Td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {v.notas ? <p className="mt-2 text-xs text-tenue">{v.notas}</p> : null}
                        </details>
                      </Td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </Tabla>

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
