'use client';

import { useEffect, useState } from 'react';
import { CLASE_CONTROL } from './formulario';
import { CampoCantidad } from './campo-cantidad';
import { SelectorArticulo } from './selector-articulo';
import { SelectorZona, type ZonaOpcion } from './selector-zona';
import { DistintivoBodega } from './color-bodega';
import { numero } from './ui';
import { nombreEnvase, type ArticuloEncontrado } from '@/lib/inventario/articulo';
import { preciosPrevios, type PreciosPrevios } from '@/lib/compras/precios-previos';

/** La fecha de la última compra, corta: solo sirve para ver si está vieja. */
function fechaCorta(valor: string | null): string {
  if (!valor) return 'fecha desconocida';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/**
 * COM-02: una línea del detalle de una importación.
 *
 * Los campos dependen unos de otros, así que van juntos en un Client Component:
 * al elegir el artículo se sabe dónde tiene existencia, y de ahí sale la zona
 * de destino sugerida.
 *
 * La sugerencia no restringe. En un movimiento de salida solo tienen sentido
 * las zonas donde hay mercadería; aquí es al revés, porque una importación
 * puede perfectamente estrenar una zona vacía. Por eso la zona ya usada se
 * propone —es lo habitual: la reposición del mismo artículo va donde ya está—
 * pero la lista completa queda a un clic.
 */
export function CamposDetalleImportacion({
  zonas,
  moneda,
}: {
  zonas: ZonaOpcion[];
  /** Código de la moneda de la cabecera, para rotular el costo. */
  moneda: string;
}) {
  const [articulo, setArticulo] = useState<ArticuloEncontrado | null>(null);
  const [zonaId, setZonaId] = useState('');
  const [costo, setCosto] = useState('');
  const [venta, setVenta] = useState('');
  const [previos, setPrevios] = useState<PreciosPrevios | null>(null);
  const [buscandoPrecios, setBuscandoPrecios] = useState(false);

  /*
   * El precio por unidad no se guarda: es el de la caja dividido por lo que
   * trae. Guardarlo dejaría que los dos números se contradijeran; calcularlo
   * aquí solo sirve para verlo mientras se escribe, que es cuando se decide.
   */
  function aNumero(texto: string): number | null {
    if (texto.trim() === '') return null;
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }

  function porUnidad(total: number | null): number | null {
    const porCaja = articulo?.unidadesPorCaja ?? 0;
    if (total === null || porCaja <= 0) return null;
    return Math.round((total / porCaja) * 10000) / 10000;
  }

  const numeroCosto = aNumero(costo);
  const numeroVenta = aNumero(venta);
  const unitarioCompra = porUnidad(numeroCosto);
  const unitarioVenta = porUnidad(numeroVenta);
  const bajoCosto = numeroCosto !== null && numeroVenta !== null && numeroVenta < numeroCosto;
  const envase = nombreEnvase(articulo?.unidad ?? null);

  /*
   * Al cambiar de artículo: si solo está en una zona, esa queda puesta. Con
   * varias no se adivina —se muestran arriba en la lista y decide la persona—,
   * y sin existencia se limpia para no arrastrar la del artículo anterior.
   */
  useEffect(() => {
    const unica = articulo?.existencias.length === 1 ? articulo.existencias[0] : undefined;
    setZonaId(unica ? String(unica.zonaId) : '');
  }, [articulo]);

  /*
   * Al elegir el artículo se traen sus precios conocidos y se dejan puestos.
   * Nadie recuerda a cuánto compró un código hace cuatro meses ni a cuánto lo
   * está vendiendo hoy, y salir a buscarlo a otra pantalla en medio de una
   * importación de treinta líneas es donde aparecen los errores.
   *
   * Se rellenan, no se bloquean: es una propuesta, y la procedencia de cada
   * cifra queda escrita debajo del campo para poder juzgarla. Un costo de hace
   * ocho meses no se acepta a ciegas.
   */
  useEffect(() => {
    if (!articulo) {
      setPrevios(null);
      setCosto('');
      setVenta('');
      return;
    }
    let vigente = true;
    setBuscandoPrecios(true);
    preciosPrevios(articulo.id)
      .then((p) => {
        if (!vigente) return;
        setPrevios(p);
        setCosto(p.costo === null ? '' : String(p.costo));
        setVenta(p.venta === null ? '' : String(p.venta));
      })
      .catch(() => {
        if (vigente) setPrevios(null);
      })
      .finally(() => {
        if (vigente) setBuscandoPrecios(false);
      });
    return () => {
      vigente = false;
    };
  }, [articulo]);

  const existencias = articulo?.existencias ?? [];
  const elegida = existencias.find((e) => String(e.zonaId) === zonaId);

  /** De dónde salió el costo propuesto. Vacío si no había ninguno. */
  const origenCosto = buscandoPrecios
    ? 'Buscando la última compra…'
    : previos?.costo !== null && previos?.costo !== undefined
      ? `Última compra: ${numero(previos.costo)} ${moneda} el ${fechaCorta(previos.costoFecha)} (importación #${previos.costoImportacion})`
      : articulo
        ? 'Primera compra de este artículo: no hay costo anterior'
        : null;

  const origenVenta = buscandoPrecios
    ? 'Buscando el precio de lista…'
    : previos?.venta !== null && previos?.venta !== undefined
      ? `Precio de hoy en la lista «${previos.ventaOrigen}»`
      : articulo
        ? 'Todavía no está en la lista de precios'
        : null;

  /*
   * VEN-07: lo que de verdad se cobró la última vez, al lado de la lista.
   *
   * Se propone el de la lista, que es la decisión vigente, pero desde que hay
   * descuento por artículo esa cifra ya no es lo que se cobró. Las dos juntas
   * es lo que permite decidir: si la lista dice 38 y se cerró en 34, o el
   * precio está alto o hay que revisarlo antes de fijar el de esta compra.
   */
  const ultimoCobrado =
    previos?.cobrado === null || previos?.cobrado === undefined
      ? null
      : `Última venta: ${numero(previos.cobrado)} ${moneda} el ${fechaCorta(previos.cobradoFecha)}` +
        (previos.cobradoCliente ? ` a ${previos.cobradoCliente}` : '');

  return (
    <>
      <SelectorArticulo nombre="variante_id" requerido alElegir={setArticulo} ancho="completo" />

      <SelectorZona
        etiqueta="Zona de destino"
        nombre="zona_id"
        zonas={zonas}
        valor={zonaId}
        alCambiar={setZonaId}
        sugeridas={existencias}
        requerido
        ancho="completo"
        ayuda={
          !articulo
            ? 'Elija primero el artículo y se propone dónde ya está'
            : existencias.length === 0
              ? 'Este artículo todavía no tiene existencia: elija dónde se guardará'
              : existencias.length === 1
                ? 'Propuesta: la única zona donde ya está'
                : `Ya está en ${existencias.length} zonas; puede usar otra`
        }
      />

      <CampoCantidad
        unidadesPorCaja={articulo?.unidadesPorCaja ?? null}
        unidad={articulo?.unidad ?? null}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Precio de compra por {envase} ({moneda})
          <span className="ml-1 text-zinc-400">(opcional)</span>
        </span>
        <input
          name="costo_caja"
          type="number"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          min={0}
          step="any"
          inputMode="decimal"
          placeholder="50"
          className={CLASE_CONTROL}
        />
        <span className="text-xs text-tenue">
          {unitarioCompra === null
            ? 'Sin precio de compra, la importación no se puede valorizar'
            : `${numero(unitarioCompra)} ${moneda} por unidad`}
        </span>
        {origenCosto ? <span className="text-xs text-tenue">{origenCosto}</span> : null}
      </label>

      {/*
       * El precio de venta va en la moneda de la importación, igual que el de
       * compra: así compararlos es exacto y no depende de ningún tipo de
       * cambio. `min` adelanta el aviso del navegador, pero quien de verdad lo
       * impide es `importacion_detalle_margen_ck` en la base.
       */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Precio de venta por {envase} ({moneda})
          <span className="ml-1 text-zinc-400">(opcional)</span>
        </span>
        <input
          name="precio_venta_caja"
          type="number"
          value={venta}
          onChange={(e) => setVenta(e.target.value)}
          min={numeroCosto ?? 0}
          step="any"
          inputMode="decimal"
          placeholder="120"
          className={CLASE_CONTROL}
        />
        <span className="text-xs text-tenue">
          {unitarioVenta === null
            ? 'Al confirmar se publica en la lista de precios de esta moneda'
            : `${numero(unitarioVenta)} ${moneda} por unidad`}
        </span>
        {origenVenta ? <span className="text-xs text-tenue">{origenVenta}</span> : null}
        {ultimoCobrado ? <span className="text-xs text-tenue">{ultimoCobrado}</span> : null}
      </label>

      {/* Resumen del margen: es la cifra por la que se toma la decisión. */}
      {numeroCosto !== null && numeroVenta !== null ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs sm:col-span-2 ${
            bajoCosto
              ? 'border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
              : 'text-tenue'
          }`}
        >
          {bajoCosto ? (
            <>
              <strong>El precio de venta está por debajo del costo.</strong> Compra{' '}
              {numero(numeroCosto)} y vende {numero(numeroVenta)} {moneda} por {envase}. No se puede
              guardar así.
            </>
          ) : (
            <>
              Margen por {envase}: <strong>{numero(numeroVenta - numeroCosto)}</strong> {moneda}
              {numeroCosto > 0 ? ` · ${(numeroVenta / numeroCosto).toFixed(2)}× el costo` : ''}
              {unitarioCompra !== null && unitarioVenta !== null
                ? ` · por unidad: ${numero(unitarioCompra)} → ${numero(unitarioVenta)}`
                : ''}
            </>
          )}
        </p>
      ) : null}

      {elegida ? (
        <p className="flex items-center gap-2 text-xs text-tenue sm:col-span-2">
          <DistintivoBodega
            codigo={elegida.bodega}
            color={elegida.color}
            titulo={elegida.bodegaNombre}
          />
          <span>
            En <code className="text-xs">{elegida.zona}</code> ya hay{' '}
            <strong>{numero(elegida.cantidad)}</strong> de este artículo; la entrada se suma a esa
            existencia.
          </span>
        </p>
      ) : null}
    </>
  );
}
