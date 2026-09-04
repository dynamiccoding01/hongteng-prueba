import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { SeleccionBuscable } from '@/components/seleccion-buscable';
import { CamposDetalleVenta, CamposLineaVenta } from '@/components/campos-venta';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { unidadLegible, type ExistenciaZona } from '@/lib/inventario/articulo';
import {
  agregarDetalleVenta,
  confirmarVenta,
  crearVenta,
  editarLineaVenta,
  editarVenta,
  eliminarLineaVenta,
} from './acciones';

export const metadata = { title: 'Notas de venta en borrador · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** Clave de una existencia concreta: un empaque en una zona. */
function clave(varianteId: number, zonaId: number): string {
  return `${varianteId}-${zonaId}`;
}

interface Opcion {
  valor: string | number;
  texto: string;
}

/** Datos de la venta que se pueden corregir mientras sea borrador. */
interface Cabecera {
  id: number;
  cliente_id: number;
  moneda_id: number;
  tipo_cambio: number;
  fecha: string;
  notas: string | null;
  /** Cuántas líneas tiene ya: con detalle, la moneda queda sellada. */
  lineas: number;
}

/**
 * Campos de la cabecera, compartidos por el alta y la corrección.
 *
 * `estado` no está aquí a propósito: pasar de BORRADOR a CONFIRMADA es trabajo
 * de `fn_confirmar_venta`, que además genera las SALIDAS.
 *
 * El tipo de cambio tampoco: ya no se teclea en la venta. Se mantiene en
 * Maestros › Tipo de cambio y cada venta se lleva una copia del valor del día
 * en que se creó. Aquí solo se muestra cuál le tocó.
 */
function CamposCabecera({
  v,
  clientes,
  monedas,
  cambioVigente,
}: {
  v?: Cabecera;
  clientes: Opcion[];
  monedas: Opcion[];
  /** Pesos por dólar que va a tomar una venta creada hoy. */
  cambioVigente: number | null;
}) {
  const cambio = v?.tipo_cambio ?? cambioVigente;
  const conDetalle = (v?.lineas ?? 0) > 0;

  return (
    <>
      {v ? <input type="hidden" name="id" value={v.id} /> : null}
      <SeleccionBuscable
        etiqueta="Cliente"
        nombre="cliente_id"
        valor={v?.cliente_id}
        opciones={clientes}
        requerido
      />
      <Seleccion
        etiqueta="Moneda"
        nombre="moneda_id"
        valor={v?.moneda_id}
        opciones={monedas}
        requerido
        ayuda={
          conDetalle
            ? 'No se puede cambiar: la venta ya tiene líneas con precios en esta moneda'
            : 'En pesos, los precios de la lista se convierten con el tipo de cambio'
        }
      />
      <Campo etiqueta="Fecha" nombre="fecha" valor={v?.fecha} tipo="date" />
      <Campo etiqueta="Notas" nombre="notas" valor={v?.notas} ancho="completo" />
      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-tenue sm:col-span-2 dark:bg-zinc-800">
        {cambio === null ? (
          <>
            <strong>No hay tipo de cambio cargado</strong>, así que esta venta no se va a poder
            crear. Cárguelo en Maestros › Tipo de cambio.
          </>
        ) : v ? (
          <>
            Tipo de cambio de esta venta: <strong>$ {numero(cambio)}</strong> por dólar. Quedó
            congelado al crearla y no se edita, porque los precios ya calculados dejarían de
            cuadrar.
          </>
        ) : (
          <>
            Se va a grabar con el dólar a <strong>$ {numero(cambio)}</strong>, que es el vigente
            hoy. Si vende en pesos, de ahí sale el precio de cada línea.
          </>
        )}
      </p>
    </>
  );
}

/**
 * VEN-01/02: notas de venta en preparación.
 *
 * Solo borradores, por lo mismo que en compras: una venta confirmada es un
 * documento sellado —`tr_venta_confirmada_inmutable`— y mezclada aquí entierra
 * lo que sí hay que terminar. El historial vive en /ventas/confirmadas.
 */
export default async function NotasDeVenta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('venta.ver');
  const puedeCrear = usuario.permisos.has('venta.crear');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [
    { data: ventas, count, error },
    { data: clientes },
    { data: monedas },
    { data: cambioVigente },
  ] = await Promise.all([
    supabase
      .from('venta')
      .select(
        'id, fecha, tipo_cambio, notas, cliente_id, moneda_id, cliente:cliente_id(nombre, lista:lista_precio_id(nombre)), moneda:moneda_id(codigo, simbolo), detalle:venta_detalle(id, variante_id, zona_id, cajas, precio_caja, descuento, subtotal, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, unidad:unidad_medida_id(nombre_es))))',
        { count: 'exact' },
      )
      .eq('estado', 'BORRADOR')
      .order('id', { ascending: false })
      .range(desde, hasta),
    supabase.from('cliente').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    // Solo dólares y pesos: son las dos que el sistema sabe convertir, y es lo
    // que impone `fn_venta_moneda` en la base. Ofrecer euros o UF aquí solo
    // servía para dejar la venta a medias, con el precio escrito a mano.
    supabase
      .from('moneda')
      .select('id, codigo, nombre')
      .in('codigo', ['USD', 'CLP'])
      .eq('activo', true)
      .order('codigo'),
    // El que va a quedar grabado en una venta creada hoy. Se pregunta a la
    // base, que es quien lo pone, para que la pantalla no anuncie otro.
    supabase.rpc('fn_tipo_cambio_vigente', { p_fecha: new Date().toISOString().slice(0, 10) }),
  ]);

  if (error) return <Vacio>No se pudieron cargar las ventas: {error.message}</Vacio>;

  const borradores = ventas ?? [];

  /*
   * Cuánta existencia hay realmente donde cada línea dice que la hay.
   *
   * Un borrador se guarda sin comprobarlo —la barrera está al confirmar, en el
   * trigger de stock—, así que una línea puede llevar meses apuntando a una
   * zona vacía y solo delatarse cuando la venta entera falla. Esta consulta va
   * acotada a las líneas que ya se están mostrando y permite avisarlo antes.
   */
  const existenciaPorLinea = new Map<string, number>();
  /** Dónde tiene existencia cada empaque: alimenta el editor de la línea. */
  const existenciasPorVariante = new Map<number, ExistenciaZona[]>();
  const idsVariante = [...new Set(borradores.flatMap((v) => v.detalle.map((d) => d.variante_id)))];

  if (idsVariante.length > 0) {
    const { data: existencias } = await supabase
      .from('stock')
      .select(
        'variante_id, zona_id, cantidad, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color))',
      )
      .in('variante_id', idsVariante)
      .gt('cantidad', 0);

    for (const s of existencias ?? []) {
      existenciaPorLinea.set(clave(s.variante_id, s.zona_id), Number(s.cantidad));
      const lista = existenciasPorVariante.get(s.variante_id) ?? [];
      lista.push({
        zonaId: s.zona_id,
        zona: s.zona.codigo,
        bodega: s.zona.bodega?.codigo ?? '—',
        bodegaNombre: s.zona.bodega?.nombre ?? null,
        color: s.zona.bodega?.color ?? 'gris',
        cantidad: Number(s.cantidad),
      });
      existenciasPorVariante.set(s.variante_id, lista);
    }

    for (const lista of existenciasPorVariante.values()) {
      lista.sort((a, b) => b.cantidad - a.cantidad);
    }
  }

  const opcionesCliente = (clientes ?? []).map((c) => ({
    valor: c.id,
    texto: `${c.codigo} — ${c.nombre}`,
  }));
  const opcionesMoneda = (monedas ?? []).map((m) => ({
    valor: m.id,
    texto: `${m.codigo} — ${m.nombre}`,
  }));

  return (
    <>
      <Encabezado
        titulo="Notas de venta en borrador"
        descripcion="Ventas en preparación: se editan hasta confirmarlas (VEN-01, VEN-02)"
      >
        <Link
          href="/ventas/confirmadas"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Ver confirmadas
        </Link>
        {puedeCrear ? (
          <FormularioDesplegable accion={crearVenta} etiquetaNuevo="Nueva venta">
            <CamposCabecera
              clientes={opcionesCliente}
              monedas={opcionesMoneda}
              cambioVigente={cambioVigente}
            />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {borradores.length === 0 ? (
        <Vacio>
          No hay notas de venta en borrador.
          {puedeCrear ? ' Use «Nueva venta» para empezar una.' : ''} Las ya confirmadas están en{' '}
          <Link href="/ventas/confirmadas">Ventas confirmadas</Link>.
        </Vacio>
      ) : (
        <div className="space-y-8">
          {borradores.map((venta) => {
            const totalCajas = venta.detalle.reduce((s, d) => s + Number(d.cajas), 0);
            // El subtotal lo calcula la base (columna generada, migración
            // 0029) y ya viene con el descuento aplicado: sumarlo aquí a mano
            // sería una segunda definición de lo mismo, lista para discrepar.
            const totalMonto = venta.detalle.reduce((s, d) => s + Number(d.subtotal ?? 0), 0);
            const totalDescuento = venta.detalle.reduce((s, d) => s + Number(d.descuento), 0);
            // Líneas que hoy no se podrían despachar. Basta una para que la
            // confirmación entera falle: es todo o nada en la base.
            const lineasSinStock = venta.detalle.filter(
              (d) =>
                (existenciaPorLinea.get(clave(d.variante_id, d.zona_id)) ?? 0) < Number(d.cajas),
            );

            return (
              <section key={venta.id} className="rounded-xl border border-borde bg-superficie p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold">Venta #{venta.id}</h2>
                  <Etiqueta tono="ambar">Borrador</Etiqueta>
                  <span className="text-sm text-zinc-500">
                    {fecha(venta.fecha)} · {venta.cliente.nombre}
                    {venta.cliente.lista ? ` (lista ${venta.cliente.lista.nombre})` : ''} ·{' '}
                    {venta.moneda.codigo}
                    {` · dólar a $ ${numero(venta.tipo_cambio)}`}
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">
                    {numero(totalCajas)} cajas · {venta.moneda.simbolo ?? ''} {numero(totalMonto)}
                    {totalDescuento > 0 ? ` (${numero(totalDescuento)} de descuento)` : ''}
                  </span>
                  {puedeCrear ? (
                    <FormularioDesplegable accion={editarVenta} etiquetaNuevo="" esEdicion>
                      <CamposCabecera
                        v={{
                          id: venta.id,
                          cliente_id: venta.cliente_id,
                          moneda_id: venta.moneda_id,
                          tipo_cambio: venta.tipo_cambio,
                          fecha: venta.fecha,
                          notas: venta.notas,
                          lineas: venta.detalle.length,
                        }}
                        clientes={opcionesCliente}
                        monedas={opcionesMoneda}
                        cambioVigente={cambioVigente}
                      />
                    </FormularioDesplegable>
                  ) : null}
                </div>

                {lineasSinStock.length > 0 ? (
                  <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                    <strong>Esta venta no se puede confirmar todavía.</strong>{' '}
                    {lineasSinStock.length === 1
                      ? 'Una línea pide'
                      : `${numero(lineasSinStock.length)} líneas piden`}{' '}
                    más cajas de las que hay en la zona indicada. Corrija la zona o la cantidad:
                    confirmar es todo o nada, así que una sola línea basta para que falle.
                  </p>
                ) : null}

                {venta.detalle.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin detalle todavía.</p>
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Artículo</Th>
                        <Th>Zona de origen</Th>
                        <Th numerico>Cantidad</Th>
                        <Th numerico>Disponible</Th>
                        <Th numerico>Precio caja</Th>
                        <Th numerico>Subtotal</Th>
                        {puedeCrear ? <Th> </Th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {venta.detalle.map((d) => {
                        const hay = existenciaPorLinea.get(clave(d.variante_id, d.zona_id)) ?? 0;
                        const alcanza = hay >= Number(d.cajas);
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
                              {/* Lo que de verdad sale de bodega: el total en
                                  unidades, que es como lo pide el cliente. */}
                              <span className="block text-xs text-tenue">
                                {numero(Number(d.cajas) * Number(d.variante.unidades_por_caja))}{' '}
                                {unidadLegible(d.variante.producto.unidad?.nombre_es ?? '')}
                              </span>
                            </Td>
                            <Td numerico>
                              {alcanza ? (
                                <span className="text-tenue">{numero(hay)}</span>
                              ) : (
                                <Etiqueta tono="rojo">
                                  {hay === 0 ? 'nada aquí' : `solo ${numero(hay)}`}
                                </Etiqueta>
                              )}
                            </Td>
                            <Td numerico tenue>
                              {d.precio_caja === null ? '—' : numero(d.precio_caja)}
                            </Td>
                            <Td numerico>
                              {d.subtotal === null ? '—' : numero(d.subtotal)}
                              {/* VEN-07: de dónde salió la cifra rebajada. Sin
                                  esto, el subtotal no cuadra con cajas ×
                                  precio y parece un error de cálculo. */}
                              {Number(d.descuento) > 0 ? (
                                <span className="block text-xs text-tenue">
                                  antes {numero(Number(d.cajas) * Number(d.precio_caja ?? 0))} ·
                                  desc. {numero(d.descuento)}
                                </span>
                              ) : null}
                            </Td>
                            {puedeCrear ? (
                              <Td>
                                <div className="flex gap-3 whitespace-nowrap">
                                  <FormularioDesplegable
                                    accion={editarLineaVenta}
                                    etiquetaNuevo=""
                                    esEdicion
                                  >
                                    <CamposLineaVenta
                                      ventaId={venta.id}
                                      topeDescuento={usuario.descuentoMaximo}
                                      linea={{
                                        id: d.id,
                                        varianteId: d.variante_id,
                                        zonaId: d.zona_id,
                                        zona: d.zona.codigo,
                                        bodega: d.zona.bodega?.codigo ?? '—',
                                        bodegaNombre: d.zona.bodega?.nombre ?? null,
                                        color: d.zona.bodega?.color ?? 'gris',
                                        cajas: Number(d.cajas),
                                        precioCaja:
                                          d.precio_caja === null ? null : Number(d.precio_caja),
                                        descuento: Number(d.descuento),
                                        codigo: d.variante.producto.codigo,
                                        unidadesPorCaja: Number(d.variante.unidades_por_caja),
                                        unidad: d.variante.producto.unidad?.nombre_es ?? '',
                                      }}
                                      existencias={existenciasPorVariante.get(d.variante_id) ?? []}
                                      moneda={venta.moneda.codigo}
                                    />
                                  </FormularioDesplegable>

                                  <FormularioDesplegable
                                    accion={eliminarLineaVenta}
                                    etiquetaNuevo="Quitar"
                                    esEdicion
                                  >
                                    <input type="hidden" name="id" value={d.id} />
                                    <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                                      Se quitará{' '}
                                      <code className="text-xs">{d.variante.producto.codigo}</code>{' '}
                                      ({numero(d.cajas)} cajas desde{' '}
                                      <code className="text-xs">{d.zona.codigo}</code>) del detalle
                                      de la venta #{venta.id}. La venta sigue en borrador y la línea
                                      se puede volver a agregar.
                                    </p>
                                  </FormularioDesplegable>
                                </div>
                              </Td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabla>
                )}

                {puedeCrear ? (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <FormularioDesplegable
                      accion={agregarDetalleVenta}
                      etiquetaNuevo="Agregar detalle"
                    >
                      <input type="hidden" name="venta_id" value={venta.id} />
                      <CamposDetalleVenta
                        ventaId={venta.id}
                        moneda={venta.moneda.codigo}
                        topeDescuento={usuario.descuentoMaximo}
                      />
                    </FormularioDesplegable>

                    {/*
                     * Se puede imprimir un borrador: bodega prepara el pedido
                     * con el papel en la mano y recién después se confirma. Las
                     * copias salen marcadas PRELIMINAR y sin folio.
                     *
                     * En pestaña nueva para no perder el borrador a medio
                     * armar: al volver, la página sigue donde estaba.
                     */}
                    {venta.detalle.length > 0 ? (
                      <a
                        href={`/imprimir/venta/${venta.id}`}
                        target="_blank"
                        rel="noopener"
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
                      >
                        Imprimir nota
                      </a>
                    ) : null}

                    {venta.detalle.length > 0 ? (
                      <FormularioDesplegable
                        accion={confirmarVenta}
                        etiquetaNuevo="Confirmar y descontar stock"
                      >
                        <input type="hidden" name="venta_id" value={venta.id} />
                        <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                          Se generará una SALIDA por cada línea ({numero(totalCajas)} cajas,{' '}
                          {venta.moneda.simbolo ?? ''} {numero(totalMonto)} {venta.moneda.codigo}).
                          {lineasSinStock.length > 0
                            ? ' Ahora mismo hay líneas sin existencia suficiente, así que la confirmación va a fallar completa.'
                            : ' Si alguna línea supera el stock disponible, la confirmación completa fallará.'}{' '}
                          No se puede deshacer desde aquí.
                        </p>
                      </FormularioDesplegable>
                    ) : null}
                  </div>
                ) : null}

                {venta.notas ? <p className="mt-3 text-sm text-zinc-500">{venta.notas}</p> : null}
              </section>
            );
          })}
        </div>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
