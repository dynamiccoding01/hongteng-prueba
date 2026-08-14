'use client';

import { useEffect, useState } from 'react';
import { CLASE_CONTROL } from './formulario';
import { CampoCantidad } from './campo-cantidad';
import { SelectorArticulo } from './selector-articulo';
import { SelectorZona, type ZonaOpcion } from './selector-zona';
import { DistintivoBodega } from './color-bodega';
import { Etiqueta, numero } from './ui';
import { precioDeLista, type PrecioDeLista } from '@/lib/ventas/precio-lista';
import {
  unidadLegible,
  type ArticuloEncontrado,
  type ExistenciaZona,
} from '@/lib/inventario/articulo';

/**
 * El precio por caja: relleno y bloqueado cuando lo fija la lista del cliente.
 *
 * Los precios se llevan en dólares, que es la moneda en la que se compra. Si
 * la venta va en dólares, el de la lista se usa tal cual; si va en pesos, se
 * multiplica por el tipo de cambio de la venta y se sube a la centena. La
 * cuenta se muestra entera —los dos pasos— para que nadie tenga que fiarse del
 * número a ciegas ni preguntarse de dónde salieron los pesos que faltaban.
 *
 * Solo queda editable cuando no hay precio que aplicar: si el artículo no está
 * en la lista del cliente, o si esa lista está en una moneda que no es el
 * dólar. Copiar el número de dólares sin convertir no es una opción:
 * `venta_detalle.precio_caja` no guarda moneda propia —se lee en la de la
 * cabecera— así que 38 dólares se facturarían como 38 pesos.
 */
function PrecioVenta({
  hayArticulo,
  lista,
  moneda,
  valorActual,
  claveCampo,
}: {
  hayArticulo: boolean;
  lista: PrecioDeLista | null;
  moneda: string;
  /** Precio ya guardado, al corregir una línea existente. */
  valorActual?: number | null;
  /** Cambia para rehacer el campo cuando cambia el artículo o el precio. */
  claveCampo: string;
}) {
  const fijado = lista !== null && lista.precioVenta !== null;
  const descuadre = lista !== null && lista.precioVenta === null;
  const convertido = lista?.motivo === 'convertido';

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Precio por caja ({moneda})
          {fijado ? null : <span className="ml-1 text-zinc-400">(opcional)</span>}
        </span>
        <input
          name="precio_caja"
          type="number"
          // `key` fuerza a rehacer el campo al cambiar de artículo: sin esto el
          // valor por defecto del artículo anterior se quedaría escrito.
          key={claveCampo}
          defaultValue={fijado ? (lista.precioVenta ?? '') : (valorActual ?? '')}
          readOnly={fijado}
          required={descuadre}
          min={0}
          step="any"
          inputMode="decimal"
          placeholder={descuadre ? 'Escriba el precio' : ''}
          className={`${CLASE_CONTROL} ${fijado ? 'cursor-not-allowed bg-zinc-100 dark:bg-zinc-800' : ''}`}
        />
        <span className="text-xs text-tenue">
          {fijado
            ? convertido
              ? `${numero(lista.precioLista)} ${lista.monedaLista} × ${numero(lista.tipoCambio)} = ${numero(lista.precioExacto)}, subido a ${numero(lista.precioVenta)} ${lista.monedaVenta}`
              : `Precio de la lista «${lista.lista}». No se edita desde aquí.`
            : descuadre
              ? 'Escríbalo a mano: no se pudo convertir'
              : hayArticulo
                ? 'Este cliente no tiene precio de lista para este artículo'
                : 'Se toma de la lista del cliente al elegir el artículo'}
        </span>
      </label>

      {descuadre ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          La lista <strong>«{lista.lista}»</strong> está en {lista.monedaLista} y esta venta va en{' '}
          {lista.monedaVenta}. Solo se sabe convertir de dólares a pesos, así que este precio hay
          que escribirlo.
        </p>
      ) : null}
    </>
  );
}

/**
 * VEN-02: una línea del detalle de una nota de venta.
 *
 * Al revés que en una importación, aquí la zona **no** es libre: una venta
 * descuenta stock, así que solo tiene sentido despachar desde donde hay. Antes
 * el desplegable ofrecía las zonas todas por igual y era fácil pedir mercadería
 * de una vacía; el borrador se guardaba sin protestar y el error aparecía
 * mucho después, al confirmar, cuando la transacción entera fallaba.
 *
 * Por eso aquí las zonas ofrecidas son solo las que tienen existencia de ese
 * artículo, y las cajas se topan con lo que hay en la zona elegida. Sigue sin
 * ser la barrera —esa es `stock_cantidad_check` en la base, que hace fallar el
 * movimiento pase lo que pase—, pero mueve el aviso al momento de digitar.
 */
export function CamposDetalleVenta({
  ventaId,
  moneda,
}: {
  ventaId: number;
  /** Código de la moneda de la venta, para rotular el precio. */
  moneda: string;
}) {
  const [articulo, setArticulo] = useState<ArticuloEncontrado | null>(null);
  const [zonaId, setZonaId] = useState('');
  const [lista, setLista] = useState<PrecioDeLista | null>(null);

  // Al cambiar de artículo: si solo hay existencia en una zona, esa queda
  // puesta; con varias decide la persona, y sin ninguna no hay nada que vender.
  useEffect(() => {
    const unica = articulo?.existencias.length === 1 ? articulo.existencias[0] : undefined;
    setZonaId(unica ? String(unica.zonaId) : '');
  }, [articulo]);

  // Qué dice la lista de precios del cliente para este artículo. Se consulta al
  // elegirlo y se descarta si mientras tanto se eligió otro.
  useEffect(() => {
    if (!articulo) {
      setLista(null);
      return;
    }
    let vigente = true;
    precioDeLista(ventaId, articulo.id)
      .then((r) => {
        if (vigente) setLista(r);
      })
      .catch(() => {
        if (vigente) setLista(null);
      });
    return () => {
      vigente = false;
    };
  }, [articulo, ventaId]);

  const existencias = articulo?.existencias ?? [];
  const elegida = existencias.find((e) => String(e.zonaId) === zonaId);
  const sinExistencia = articulo !== null && existencias.length === 0;

  // Solo las zonas con existencia son elegibles: la lista completa que recibe
  // `SelectorZona` se arma con ellas, no con el maestro de zonas.
  const zonasConStock = existencias.map((e) => ({
    id: e.zonaId,
    codigo: e.zona,
    bodega: e.bodega,
    bodegaNombre: e.bodegaNombre,
    color: e.color,
  }));

  return (
    <>
      {/* Una venta saca mercadería: un artículo sin existencia no se puede
          elegir, y el buscador lo dice en la fila en vez de dejar llegar al
          callejón sin salida de una zona de origen sin opciones. */}
      <SelectorArticulo
        nombre="variante_id"
        requerido
        alElegir={setArticulo}
        ancho="completo"
        exigirExistencia
      />

      <SelectorZona
        etiqueta="Zona de origen"
        nombre="zona_id"
        zonas={zonasConStock}
        valor={zonaId}
        alCambiar={setZonaId}
        sugeridas={existencias}
        soloConExistencia
        requerido
        ancho="completo"
        ayuda={
          !articulo
            ? 'Elija primero el artículo y se listan las zonas donde hay'
            : sinExistencia
              ? 'Este artículo no tiene existencia en ninguna zona: no hay nada que despachar'
              : existencias.length === 1
                ? 'Única zona con existencia'
                : 'Solo las zonas donde hay existencia'
        }
      />

      <CampoCantidad
        unidadesPorCaja={articulo?.unidadesPorCaja ?? null}
        unidad={articulo?.unidad ?? null}
        maximo={elegida?.cantidad}
        nota={articulo && !elegida ? 'Elija la zona' : undefined}
      />

      {/*
       * El precio lo fija la lista del cliente, no quien digita: cuando la
       * lista lo cubre el campo se muestra relleno y bloqueado. La acción
       * vuelve a resolverlo en el servidor, así que bloquearlo aquí es
       * comodidad y no la barrera.
       */}
      <PrecioVenta
        hayArticulo={articulo !== null}
        lista={lista}
        moneda={moneda}
        claveCampo={`${articulo?.id ?? 0}-${lista?.precioVenta ?? 'libre'}`}
      />

      {elegida ? (
        <p className="flex items-center gap-2 text-xs text-tenue sm:col-span-2">
          <DistintivoBodega
            codigo={elegida.bodega}
            color={elegida.color}
            titulo={elegida.bodegaNombre}
          />
          <span>
            En <code className="text-xs">{elegida.zona}</code> hay{' '}
            <strong>{numero(elegida.cantidad)}</strong> cajas de{' '}
            {numero(articulo?.unidadesPorCaja ?? 0)} {unidadLegible(articulo?.unidad ?? '')}.
          </span>
        </p>
      ) : null}
    </>
  );
}

/** Los datos de una línea ya guardada, tal como la muestra el listado. */
export interface LineaVenta {
  id: number;
  varianteId: number;
  zonaId: number;
  zona: string;
  bodega: string;
  bodegaNombre: string | null;
  color: string;
  cajas: number;
  precioCaja: number | null;
  codigo: string;
  unidadesPorCaja: number;
  unidad: string;
}

/**
 * VEN-02: corrige una línea que ya está en el borrador.
 *
 * El artículo no se cambia —cambiarlo es otra línea, no una corrección de
 * esta—, así que se muestra fijo y se editan la zona, las cajas y el precio,
 * que es lo que de verdad se equivoca al digitar.
 *
 * La zona actual se ofrece siempre, aunque esté vacía: es lo que hoy dice la
 * línea y esconderla dejaría el campo en blanco sin explicar por qué. Sale
 * marcada con su existencia real, que puede ser cero.
 */
export function CamposLineaVenta({
  ventaId,
  linea,
  existencias,
  moneda,
}: {
  ventaId: number;
  linea: LineaVenta;
  /** Todas las zonas donde ese empaque tiene existencia hoy. */
  existencias: ExistenciaZona[];
  moneda: string;
}) {
  const [zonaId, setZonaId] = useState(String(linea.zonaId));
  const [lista, setLista] = useState<PrecioDeLista | null>(null);

  // El precio de lista rige igual al corregir: si no se consultara aquí, el
  // campo bloqueado en el alta se podría rodear entrando a editar.
  useEffect(() => {
    let vigente = true;
    precioDeLista(ventaId, linea.varianteId)
      .then((r) => {
        if (vigente) setLista(r);
      })
      .catch(() => {
        if (vigente) setLista(null);
      });
    return () => {
      vigente = false;
    };
  }, [ventaId, linea.varianteId]);

  // La zona actual va primera aunque no tenga existencia: si desapareció de la
  // lista, el desplegable se vería vacío sin decir que había algo puesto.
  const actualTieneStock = existencias.some((e) => e.zonaId === linea.zonaId);
  const opciones: ExistenciaZona[] = actualTieneStock
    ? existencias
    : [
        {
          zonaId: linea.zonaId,
          zona: linea.zona,
          bodega: linea.bodega,
          bodegaNombre: linea.bodegaNombre,
          color: linea.color,
          cantidad: 0,
        },
        ...existencias,
      ];

  const comoZona: ZonaOpcion[] = opciones.map((e) => ({
    id: e.zonaId,
    codigo: e.zona,
    bodega: e.bodega,
    bodegaNombre: e.bodegaNombre,
    color: e.color,
  }));

  const elegida = opciones.find((e) => String(e.zonaId) === zonaId);
  const alcanza = (elegida?.cantidad ?? 0) >= linea.cajas;

  return (
    <>
      <input type="hidden" name="id" value={linea.id} />

      <p className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
        <span className="font-medium">Artículo</span>
        <code className="text-xs">{linea.codigo}</code>
        <span className="text-xs text-tenue">
          {numero(linea.unidadesPorCaja)} {unidadLegible(linea.unidad)} por caja
        </span>
        {existencias.length === 0 ? <Etiqueta tono="rojo">sin existencia</Etiqueta> : null}
      </p>

      <SelectorZona
        etiqueta="Zona de origen"
        nombre="zona_id"
        zonas={comoZona}
        valor={zonaId}
        alCambiar={setZonaId}
        sugeridas={opciones}
        soloConExistencia
        requerido
        ancho="completo"
        ayuda={
          existencias.length === 0
            ? 'Este artículo no tiene existencia en ninguna zona: elimine la línea o reponga stock'
            : 'Solo las zonas donde hay existencia, más la que tiene puesta'
        }
      />

      <CampoCantidad
        valorInicial={linea.cajas}
        unidadesPorCaja={linea.unidadesPorCaja}
        unidad={linea.unidad}
        maximo={elegida && elegida.cantidad > 0 ? elegida.cantidad : undefined}
        nota={
          !elegida
            ? 'Elija la zona'
            : elegida.cantidad === 0
              ? 'En esta zona no hay nada: elija otra'
              : undefined
        }
      />

      <PrecioVenta
        hayArticulo
        lista={lista}
        moneda={moneda}
        valorActual={linea.precioCaja}
        claveCampo={`${linea.id}-${lista?.precioVenta ?? 'libre'}`}
      />

      {elegida ? (
        <p className="flex items-center gap-2 text-xs text-tenue sm:col-span-2">
          <DistintivoBodega
            codigo={elegida.bodega}
            color={elegida.color}
            titulo={elegida.bodegaNombre}
          />
          <span>
            En <code className="text-xs">{elegida.zona}</code> hay{' '}
            <strong>{numero(elegida.cantidad)}</strong>
            {alcanza ? '' : `, y la línea pide ${numero(linea.cajas)}`}.
          </span>
        </p>
      ) : null}
    </>
  );
}
