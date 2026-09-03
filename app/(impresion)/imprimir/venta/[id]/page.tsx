import { notFound } from 'next/navigation';
import { registrarEnBitacora, requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { BarraImpresion, type CopiaElegible } from '@/components/barra-impresion';
import {
  BodegaImpresa,
  Dato,
  EncabezadoDocumento,
  Firma,
  Hoja,
  ParaLlenar,
  Td,
  Th,
  type Empresa,
} from '@/components/impresion';
import { unidadLegible } from '@/lib/inventario/articulo';

export const metadata = { title: 'Nota de venta · Impresión' };

/**
 * Las cuatro copias de la nota de venta, en una sola vista para imprimir.
 *
 * Cada una existe porque la mira una persona distinta y necesita cosas
 * distintas, no porque sea bonito tener variantes:
 *
 *   · VENDEDOR  — el original que se archiva: todo, incluidos precios y
 *                 ubicaciones.
 *   · CLIENTE   — qué se lleva y cuánto paga. Sin ubicaciones: dónde estaba
 *                 guardada la mercadería es información interna de la bodega.
 *   · BODEGA    — la hoja de preparación. Sin un solo precio, ordenada por
 *                 recorrido de bodega y con casilla para ir marcando.
 *   · DESPACHO  — la carga: mismas ubicaciones pero agrupadas por bodega, con
 *                 el color de cada una y los datos del camión para llenar.
 *
 * Se puede imprimir un borrador a propósito: bodega prepara el pedido con el
 * papel en la mano y recién después se confirma. Esas copias salen marcadas
 * PRELIMINAR y sin folio, porque el folio lo asigna la confirmación.
 */
export default async function ImprimirVenta({ params }: { params: Promise<{ id: string }> }) {
  await requerirPermiso('venta.ver');

  const { id } = await params;
  const ventaId = Number(id);
  if (!Number.isInteger(ventaId) || ventaId <= 0) notFound();

  const supabase = await crearClienteServidor();

  const [{ data: venta }, { data: empresa }] = await Promise.all([
    supabase
      .from('venta')
      // Una sola cadena literal, sin concatenar: los tipos del `select` los
      // deduce Supabase del literal, y un `'a' + 'b'` los degrada a `string`.
      .select(
        'id, folio, estado, fecha, tipo_cambio, notas, confirmada_en, cliente:cliente_id(codigo, nombre, rut, contacto, telefono, direccion, ciudad, pais, lista:lista_precio_id(nombre)), moneda:moneda_id(codigo, simbolo, decimales), detalle:venta_detalle(id, cajas, precio_caja, descuento, subtotal, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, descripcion_es, rango_tallas, unidad:unidad_medida_id(nombre_es))))',
      )
      .eq('id', ventaId)
      .maybeSingle(),
    supabase
      .from('empresa')
      .select('razon_social, rut, giro, direccion, ciudad, telefono, email')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  if (!venta) notFound();

  // Queda registro de quién sacó el documento y de cuál: una nota de venta
  // impresa circula fuera del sistema, así que la bitácora es lo único que
  // permite reconstruir después cuántas copias salieron y de qué venta.
  await registrarEnBitacora(
    'IMPRIMIR',
    'ventas',
    `Nota de venta #${venta.id}${venta.folio ? ` (folio ${venta.folio})` : ' (borrador, sin folio)'}`,
  );

  const preliminar = venta.estado !== 'CONFIRMADA';
  const decimales = venta.moneda?.decimales ?? 2;
  const codigoMoneda = venta.moneda?.codigo ?? '';

  /** Importes en la moneda de la venta, con los decimales que esa moneda usa. */
  function dinero(valor: number): string {
    return new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);
  }

  function cantidad(valor: number): string {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(valor);
  }

  const lineas = venta.detalle.map((d) => {
    const porCaja = Number(d.variante.unidades_por_caja);
    const bultos = Number(d.cajas);
    const precioCaja = d.precio_caja === null ? null : Number(d.precio_caja);
    return {
      id: d.id,
      codigo: d.variante.producto.codigo,
      descripcion: d.variante.producto.descripcion_es,
      tallas: d.variante.producto.rango_tallas,
      unidad: unidadLegible(d.variante.producto.unidad?.nombre_es ?? ''),
      porCaja,
      bultos,
      unidades: bultos * porCaja,
      precioCaja,
      // El talonario pide el precio POR UNIDAD, no por caja. No se guarda: se
      // deriva, para que los dos números nunca puedan contradecirse.
      precioUnitario: precioCaja === null || porCaja <= 0 ? null : precioCaja / porCaja,
      // VEN-07: el total es el subtotal que calcula la base, ya con el
      // descuento acordado restado. Lo que va al papel es lo que se cobra.
      descuento: Number(d.descuento),
      total: d.subtotal === null ? null : Number(d.subtotal),
      zona: d.zona.codigo,
      bodega: d.zona.bodega?.codigo ?? '—',
      bodegaNombre: d.zona.bodega?.nombre ?? null,
      color: d.zona.bodega?.color ?? 'gris',
    };
  });

  const totalBultos = lineas.reduce((s, l) => s + l.bultos, 0);
  const totalUnidades = lineas.reduce((s, l) => s + l.unidades, 0);
  const total = lineas.reduce((s, l) => s + (l.total ?? 0), 0);
  const totalDescuento = lineas.reduce((s, l) => s + l.descuento, 0);
  const hayLineaSinPrecio = lineas.some((l) => l.total === null);

  // Orden de recorrido de bodega: se camina una vez, bodega por bodega y zona
  // por zona. Con el orden de digitación se cruza el galpón varias veces.
  const porUbicacion = [...lineas].sort(
    (a, b) =>
      a.bodega.localeCompare(b.bodega) ||
      a.zona.localeCompare(b.zona) ||
      a.codigo.localeCompare(b.codigo),
  );

  const bodegas = [...new Set(porUbicacion.map((l) => l.bodega))].map((codigo) => {
    const suyas = porUbicacion.filter((l) => l.bodega === codigo);
    return {
      codigo,
      nombre: suyas[0]?.bodegaNombre ?? null,
      color: suyas[0]?.color ?? 'gris',
      lineas: suyas,
      bultos: suyas.reduce((s, l) => s + l.bultos, 0),
      unidades: suyas.reduce((s, l) => s + l.unidades, 0),
    };
  });

  const fechaLarga = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(
    new Date(`${venta.fecha}T00:00:00`),
  );

  const cabecera = {
    empresa: (empresa ?? { razon_social: 'Empresa sin configurar' }) as Empresa,
    documento: 'NOTA DE VENTA',
    folio: venta.folio,
    preliminar,
    fecha: fechaLarga,
  };

  const COPIAS: CopiaElegible[] = [
    { clave: 'vendedor', titulo: 'Vendedor', para: 'El original: todo, con precios y ubicaciones' },
    { clave: 'cliente', titulo: 'Cliente', para: 'Qué se lleva y cuánto paga, sin ubicaciones' },
    { clave: 'bodega', titulo: 'Bodega', para: 'Hoja de preparación, sin precios' },
    { clave: 'despacho', titulo: 'Despacho', para: 'La carga, por bodega, con datos del camión' },
  ];

  /** Referencia interna: la venta se sigue por su id aunque ya tenga folio. */
  const referencia = `Venta interna #${venta.id}`;

  return (
    <>
      <BarraImpresion copias={COPIAS} />

      {/* ------------------------------------------------------------------
          1 · VENDEDOR — el original que se archiva
      ------------------------------------------------------------------ */}
      <Hoja copia="vendedor">
        <EncabezadoDocumento {...cabecera} copia="Original · Vendedor" />

        <div className="sin-partir mb-3 grid grid-cols-2 gap-x-6 border border-zinc-400 p-2">
          <div>
            <Dato etiqueta="Cliente" valor={venta.cliente.nombre} />
            <Dato etiqueta="Código" valor={venta.cliente.codigo} />
            <Dato etiqueta="RUT" valor={venta.cliente.rut} />
            <Dato etiqueta="Contacto" valor={venta.cliente.contacto} />
            <Dato etiqueta="Teléfono" valor={venta.cliente.telefono} />
          </div>
          <div>
            <Dato etiqueta="Dirección" valor={venta.cliente.direccion} />
            <Dato
              etiqueta="Ciudad"
              valor={[venta.cliente.ciudad, venta.cliente.pais].filter(Boolean).join(', ')}
            />
            <Dato
              etiqueta="Moneda"
              valor={`${codigoMoneda} · dólar a $ ${cantidad(Number(venta.tipo_cambio))}`}
            />
            <Dato etiqueta="Lista de precios" valor={venta.cliente.lista?.nombre} />
          </div>
          {/*
           * La marca de embarque no está en el sistema: se pinta sobre los
           * bultos y se acuerda con el cliente en el momento, así que va como
           * línea para escribir, igual que en el talonario.
           */}
          <ParaLlenar etiqueta="Marcas" ancho="ancho" />
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th ancho="14%">Código</Th>
              <Th>Descripción mercadería</Th>
              <Th ancho="9%">Tallas</Th>
              <Th ancho="11%">Ubicación</Th>
              <Th ancho="8%" numerico>
                Bultos
              </Th>
              <Th ancho="9%" numerico>
                Unidades
              </Th>
              <Th ancho="11%" numerico>
                P. unitario
              </Th>
              <Th ancho="12%" numerico>
                Subtotal
              </Th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id}>
                <Td fuerte>
                  <span className="font-mono">{l.codigo}</span>
                </Td>
                <Td>{l.descripcion ?? '—'}</Td>
                <Td>{l.tallas ?? '—'}</Td>
                <Td>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <BodegaImpresa codigo={l.bodega} color={l.color} />
                    <span className="font-mono text-[10px]">{l.zona}</span>
                  </span>
                </Td>
                <Td numerico>{cantidad(l.bultos)}</Td>
                <Td numerico>{cantidad(l.unidades)}</Td>
                <Td numerico>{l.precioUnitario === null ? '—' : dinero(l.precioUnitario)}</Td>
                <Td numerico fuerte>
                  {l.total === null ? '—' : dinero(l.total)}
                  {/* VEN-07: sin esta línea el subtotal no cuadra con el
                      precio unitario por las unidades, y en un papel no hay
                      forma de preguntar de dónde salió la diferencia. */}
                  {l.descuento > 0 ? (
                    <span className="block text-[9px] font-normal">
                      desc. {dinero(l.descuento)}
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
            <tr>
              <Td columnas={4} fuerte>
                TOTAL
              </Td>
              <Td numerico fuerte>
                {cantidad(totalBultos)}
              </Td>
              <Td numerico fuerte>
                {cantidad(totalUnidades)}
              </Td>
              <Td />
              <Td numerico fuerte>
                {dinero(total)} {codigoMoneda}
              </Td>
            </tr>
          </tbody>
        </table>

        {hayLineaSinPrecio ? (
          <p className="mt-1 text-[10px] font-semibold">
            Atención: hay líneas sin precio; el total no las incluye.
          </p>
        ) : null}

        {totalDescuento > 0 ? (
          <p className="mt-1 text-[10px]">
            Descuentos por artículo: {dinero(totalDescuento)} {codigoMoneda}. El total ya está
            rebajado.
          </p>
        ) : null}

        {venta.notas ? <p className="mt-2 text-[11px]">Notas: {venta.notas}</p> : null}

        <PieTransporte referencia={referencia} conRegimen />
      </Hoja>

      {/* ------------------------------------------------------------------
          2 · CLIENTE — qué se lleva y cuánto paga
      ------------------------------------------------------------------ */}
      <Hoja copia="cliente">
        <EncabezadoDocumento {...cabecera} copia="Copia · Cliente" />

        <div className="sin-partir mb-3 grid grid-cols-2 gap-x-6 border border-zinc-400 p-2">
          <div>
            <Dato etiqueta="Señor(es)" valor={venta.cliente.nombre} />
            <Dato etiqueta="RUT" valor={venta.cliente.rut} />
          </div>
          <div>
            <Dato etiqueta="Dirección" valor={venta.cliente.direccion} />
            <Dato
              etiqueta="Ciudad"
              valor={[venta.cliente.ciudad, venta.cliente.pais].filter(Boolean).join(', ')}
            />
          </div>
        </div>

        {/* Sin ubicaciones: en qué zona estaba guardada la mercadería es
              información interna de la bodega y al cliente no le dice nada. */}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th ancho="16%">Código</Th>
              <Th>Descripción mercadería</Th>
              <Th ancho="10%">Tallas</Th>
              <Th ancho="10%" numerico>
                Bultos
              </Th>
              <Th ancho="11%" numerico>
                Unidades
              </Th>
              <Th ancho="13%" numerico>
                P. unitario
              </Th>
              <Th ancho="14%" numerico>
                Subtotal
              </Th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id}>
                <Td fuerte>
                  <span className="font-mono">{l.codigo}</span>
                </Td>
                <Td>{l.descripcion ?? '—'}</Td>
                <Td>{l.tallas ?? '—'}</Td>
                <Td numerico>{cantidad(l.bultos)}</Td>
                <Td numerico>{cantidad(l.unidades)}</Td>
                <Td numerico>{l.precioUnitario === null ? '—' : dinero(l.precioUnitario)}</Td>
                <Td numerico fuerte>
                  {l.total === null ? '—' : dinero(l.total)}
                  {l.descuento > 0 ? (
                    <span className="block text-[9px] font-normal">
                      desc. {dinero(l.descuento)}
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sin-partir mt-2 flex justify-end">
          <table className="border-collapse">
            <tbody>
              <tr>
                <Td>Total bultos</Td>
                <Td numerico>{cantidad(totalBultos)}</Td>
              </tr>
              <tr>
                <Td>Total unidades</Td>
                <Td numerico>{cantidad(totalUnidades)}</Td>
              </tr>
              {totalDescuento > 0 ? (
                <tr>
                  <Td>Descuentos</Td>
                  <Td numerico>− {dinero(totalDescuento)}</Td>
                </tr>
              ) : null}
              <tr>
                <Td fuerte>TOTAL {codigoMoneda}</Td>
                <Td numerico fuerte>
                  <span className="text-base">{dinero(total)}</span>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sin-partir mt-8 grid grid-cols-2 gap-10">
          <Firma etiqueta="Recibí conforme · Cliente" />
          <Firma etiqueta={`Por ${cabecera.empresa.razon_social}`} />
        </div>
        <p className="mt-3 text-[9px] text-zinc-600">{referencia}</p>
      </Hoja>

      {/* ------------------------------------------------------------------
          3 · BODEGA — hoja de preparación, sin un solo precio
      ------------------------------------------------------------------ */}
      <Hoja copia="bodega">
        <EncabezadoDocumento {...cabecera} copia="Copia · Bodega" />

        <div className="sin-partir mb-3 flex items-baseline justify-between gap-4 border border-zinc-400 p-2">
          <Dato etiqueta="Preparar para" valor={venta.cliente.nombre} />
          <p className="text-[11px] font-bold">
            {cantidad(totalBultos)} bultos · {cantidad(totalUnidades)} unidades
          </p>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th ancho="5%">✓</Th>
              <Th ancho="10%">Bodega</Th>
              <Th ancho="11%">Zona</Th>
              <Th ancho="18%">Código</Th>
              <Th>Descripción mercadería</Th>
              <Th ancho="10%">Tallas</Th>
              <Th ancho="10%" numerico>
                Bultos
              </Th>
              <Th ancho="11%" numerico>
                Unidades
              </Th>
            </tr>
          </thead>
          <tbody>
            {porUbicacion.map((l) => (
              <tr key={l.id}>
                {/* La casilla se marca a lápiz a medida que se junta cada
                      línea: es la razón de ser de esta copia. */}
                <Td>
                  <span className="block h-3.5 w-3.5 border border-zinc-700" />
                </Td>
                <Td>
                  <BodegaImpresa codigo={l.bodega} color={l.color} />
                </Td>
                <Td fuerte>
                  <span className="font-mono text-sm">{l.zona}</span>
                </Td>
                <Td fuerte>
                  <span className="font-mono text-sm">{l.codigo}</span>
                </Td>
                <Td>{l.descripcion ?? '—'}</Td>
                <Td>{l.tallas ?? '—'}</Td>
                <Td numerico fuerte>
                  <span className="text-sm">{cantidad(l.bultos)}</span>
                </Td>
                <Td numerico>{cantidad(l.unidades)}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-2 text-[10px] text-zinc-600">
          Ordenado por bodega y zona, en orden de recorrido. Sin precios: esta copia se queda en
          bodega.
        </p>

        <div className="sin-partir mt-8 grid grid-cols-2 gap-10">
          <Firma etiqueta="Preparado por" />
          <Firma etiqueta="Revisado por" />
        </div>
        <p className="mt-3 text-[9px] text-zinc-600">{referencia}</p>
      </Hoja>

      {/* ------------------------------------------------------------------
          4 · DESPACHO — la carga, agrupada por bodega
      ------------------------------------------------------------------ */}
      <Hoja copia="despacho">
        <EncabezadoDocumento {...cabecera} copia="Copia · Despacho" />

        <div className="sin-partir mb-3 grid grid-cols-2 gap-x-6 border border-zinc-400 p-2">
          <div>
            <Dato etiqueta="Cliente" valor={venta.cliente.nombre} />
            <Dato etiqueta="Contacto" valor={venta.cliente.contacto} />
            <Dato etiqueta="Teléfono" valor={venta.cliente.telefono} />
          </div>
          <div>
            <Dato etiqueta="Destino" valor={venta.cliente.direccion} />
            <Dato
              etiqueta="Ciudad"
              valor={[venta.cliente.ciudad, venta.cliente.pais].filter(Boolean).join(', ')}
            />
            <Dato
              etiqueta="Carga total"
              valor={`${cantidad(totalBultos)} bultos · ${cantidad(totalUnidades)} unidades`}
            />
          </div>
          {/* La marca pintada en los bultos: es con lo que se identifican en
              el camión y en el destino. Se escribe a mano al despachar. */}
          <ParaLlenar etiqueta="Marcas" ancho="ancho" />
        </div>

        {/* Agrupado por bodega y no por línea: el camión carga galpón por
              galpón, y lo que hace falta saber en cada parada es cuántos
              bultos salen de ahí. */}
        {bodegas.map((b) => (
          <div key={b.codigo} className="sin-partir mb-3">
            <div className="mb-1 flex items-baseline gap-2">
              <BodegaImpresa codigo={b.codigo} color={b.color} />
              <span className="text-[11px] font-bold">{b.nombre ?? b.codigo}</span>
              <span className="text-[11px] text-zinc-700">
                {cantidad(b.bultos)} bultos · {cantidad(b.unidades)} unidades
              </span>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th ancho="12%">Zona</Th>
                  <Th ancho="18%">Código</Th>
                  <Th>Descripción mercadería</Th>
                  <Th ancho="10%">Tallas</Th>
                  <Th ancho="12%" numerico>
                    Bultos
                  </Th>
                  <Th ancho="12%" numerico>
                    Unidades
                  </Th>
                </tr>
              </thead>
              <tbody>
                {b.lineas.map((l) => (
                  <tr key={l.id}>
                    <Td fuerte>
                      <span className="font-mono text-sm">{l.zona}</span>
                    </Td>
                    <Td fuerte>
                      <span className="font-mono text-sm">{l.codigo}</span>
                    </Td>
                    <Td>{l.descripcion ?? '—'}</Td>
                    <Td>{l.tallas ?? '—'}</Td>
                    <Td numerico fuerte>
                      <span className="text-sm">{cantidad(l.bultos)}</span>
                    </Td>
                    <Td numerico>{cantidad(l.unidades)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <PieTransporte referencia={referencia} />
      </Hoja>
    </>
  );
}

/**
 * El pie del talonario: régimen aduanero y datos del camión.
 *
 * Va en blanco a propósito. Chofer, patente, RUT y total de bultos se anotan
 * con el camión en la puerta, y el régimen lo marca quien despacha; capturarlos
 * antes en el sistema obligaría a llenar seis campos más en cada venta para
 * datos que todavía no se conocen.
 */
function PieTransporte({ referencia, conRegimen }: { referencia: string; conRegimen?: boolean }) {
  const REGIMENES = ['REEXP.', 'S.R.F.', 'TRASP.', 'REG. GEN.', 'OTROS'];

  return (
    <div className="sin-partir mt-6 border-t border-zinc-400 pt-3">
      {conRegimen ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          {REGIMENES.map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <span className="block h-3.5 w-3.5 border border-zinc-700" />
              <span className="text-[10px] font-semibold tracking-wide">{r}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-x-6 gap-y-4">
        <ParaLlenar etiqueta="Chofer" />
        <ParaLlenar etiqueta="RUT chofer" />
        <ParaLlenar etiqueta="Patente" />
        <ParaLlenar etiqueta="Total bultos" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-10">
        <Firma etiqueta="Entrega · Bodega" />
        <Firma etiqueta="Recibe · Transportista" />
      </div>

      <p className="mt-3 text-[9px] text-zinc-600">{referencia}</p>
    </div>
  );
}
