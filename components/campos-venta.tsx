'use client';

import { useEffect, useState } from 'react';
import { CLASE_CONTROL } from './formulario';
import { CAJAS_POR_DEFECTO, CampoCantidad } from './campo-cantidad';
import { SelectorArticulo } from './selector-articulo';
import { SelectorZona, type ZonaOpcion } from './selector-zona';
import { DistintivoBodega } from './color-bodega';
import { Etiqueta, numero } from './ui';
import { precioDeLista, type PrecioDeLista } from '@/lib/ventas/precio-lista';
import {
  descuentoParaSubtotal,
  subtotalBruto,
  subtotalConDescuento,
  subtotalMinimo,
  superaElTope,
} from '@/lib/ventas/descuento';
import {
  nombreEnvase,
  piezas,
  type ArticuloEncontrado,
  type ExistenciaZona,
} from '@/lib/inventario/articulo';

/**
 * El precio del envase —de la caja, la docena o el par, según el artículo—:
 * relleno y bloqueado cuando lo fija la lista del cliente.
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
 *
 * Rebajar el importe acordado con el cliente **no** se hace aquí: para eso
 * está el subtotal, más abajo. Este número es el de la lista y así se queda.
 */
function PrecioVenta({
  hayArticulo,
  lista,
  moneda,
  unidad,
  valorActual,
  claveCampo,
  alEscribir,
}: {
  hayArticulo: boolean;
  lista: PrecioDeLista | null;
  moneda: string;
  /** Unidad de medida del artículo: el precio es por uno de estos. */
  unidad: string | null;
  /** Precio ya guardado, al corregir una línea existente. */
  valorActual?: number | null;
  /** Cambia para rehacer el campo cuando cambia el artículo o el precio. */
  claveCampo: string;
  /**
   * Avisa el precio tecleado, que hace falta para calcular el subtotal. Solo
   * se usa cuando el campo está libre: si lo fija la lista, el formulario que
   * contiene este componente ya tiene ese número.
   */
  alEscribir?: (precio: number | null) => void;
}) {
  const fijado = lista !== null && lista.precioVenta !== null;
  const descuadre = lista !== null && lista.precioVenta === null;
  const convertido = lista?.motivo === 'convertido';

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Precio por {nombreEnvase(unidad)} ({moneda})
          {fijado ? null : <span className="ml-1 text-zinc-400">(opcional)</span>}
        </span>
        <input
          name="precio_caja"
          type="number"
          // `key` fuerza a rehacer el campo al cambiar de artículo: sin esto el
          // valor por defecto del artículo anterior se quedaría escrito.
          key={claveCampo}
          defaultValue={fijado ? (lista.precioVenta ?? '') : (valorActual ?? '')}
          onChange={(e) => {
            const n = e.target.value.trim() === '' ? null : Number(e.target.value);
            alEscribir?.(n !== null && Number.isFinite(n) ? n : null);
          }}
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
          {lista.motivo === 'tipo_cambio_invalido' ? (
            <>
              Esta venta no tiene un tipo de cambio con el que convertir el precio de la lista{' '}
              <strong>«{lista.lista}»</strong>. Cárguelo en Maestros › Tipo de cambio, o escriba
              este precio a mano.
            </>
          ) : (
            <>
              La lista <strong>«{lista.lista}»</strong> está en {lista.monedaLista} y esta venta va
              en {lista.monedaVenta}. Solo se sabe convertir de dólares a pesos, así que este precio
              hay que escribirlo.
            </>
          )}
        </p>
      ) : null}
    </>
  );
}

/**
 * VEN-07: el subtotal de la línea, que se puede dejar en otra cifra.
 *
 * Es el campo que pidió el cliente en la reunión. En el mostrador nadie
 * negocia el precio por caja ni un porcentaje: se mira el total de la línea
 * —«son 5.950»— y se pide una cifra redonda, «déjemelo en 5.900». Por eso lo
 * que se escribe aquí es el subtotal ya acordado, y la rebaja la deduce el
 * servidor restando contra el precio que él mismo resolvió.
 *
 * Lo que viaja cuando cambian las cajas o el precio es **la rebaja**, no el
 * subtotal. Si la línea pasa de 7 cajas a 10, arrastrar los 5.900 que se
 * hablaron convertiría un cambio de cantidad en un descuento enorme que nadie
 * pidió; arrastrar los 50 de rebaja, en cambio, es lo que se acordó y lo mismo
 * que hace el servidor cuando el campo no llega. Antes el campo volvía al
 * bruto, y como el bruto también cambia solo —al llegar la respuesta asíncrona
 * del precio de lista— la rebaja pactada se borraba sin que nadie tocara nada.
 *
 * La cuenta no se hace aquí: se llama a las mismas funciones que usa la acción
 * del servidor, para que lo que se ve mientras se teclea y lo que se guarda
 * sean el mismo número.
 */
function CampoSubtotal({
  cajas,
  precio,
  moneda,
  descuentoInicial,
  tope,
}: {
  /** Cantidad tecleada. Nula mientras el campo esté vacío. */
  cajas: number | null;
  /** Precio por caja ya resuelto. Nulo mientras no haya. */
  precio: number | null;
  moneda: string;
  /** La rebaja ya guardada, al corregir una línea existente. */
  descuentoInicial?: number;
  /**
   * VEN-07: porcentaje máximo de descuento del rol de quien vende, o `null` si
   * no tiene tope. Se escribe como una cifra —«hasta 5.355»— y no como el
   * porcentaje: es lo que hay que decirle al cliente sin hacer la cuenta de
   * cabeza delante suyo.
   */
  tope?: number | null;
}) {
  const bruto = cajas === null ? null : subtotalBruto(cajas, precio);
  const rebajaPrevia = descuentoInicial ?? 0;

  /** Lo que muestra el campo cuando se rehace: el bruto menos lo ya acordado. */
  const sugerido =
    cajas === null ? null : (subtotalConDescuento(cajas, precio, rebajaPrevia) ?? null);
  const comoTexto = sugerido === null ? '' : String(sugerido);

  const [texto, setTexto] = useState(comoTexto);

  // Estado derivado de props: cuando cambia el bruto, el campo se rehace.
  // Se hace en el render y no en un efecto —el patrón que documenta React—
  // para que no se alcance a ver un instante la cifra vieja.
  const [brutoPrevio, setBrutoPrevio] = useState(bruto);
  if (bruto !== brutoPrevio) {
    setBrutoPrevio(bruto);
    setTexto(comoTexto);
  }

  const pedido = texto.trim() === '' ? undefined : Number(texto);
  const calculo = cajas === null ? null : descuentoParaSubtotal(cajas, precio, pedido);
  const errorCalculo = calculo !== null && 'error' in calculo ? calculo.error : null;
  const descuento = calculo !== null && 'descuento' in calculo ? calculo.descuento : 0;

  const topeAplicado = tope ?? null;
  const minimo = cajas === null ? null : subtotalMinimo(cajas, precio, topeAplicado);
  const fallo =
    errorCalculo ?? (cajas === null ? null : superaElTope(cajas, precio, descuento, topeAplicado));

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        Subtotal ({moneda})<span className="ml-1 text-zinc-400">(opcional)</span>
      </span>
      <input
        name="subtotal"
        type="number"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={bruto === null}
        min={minimo ?? 0}
        max={bruto ?? undefined}
        step="any"
        inputMode="decimal"
        className={`${CLASE_CONTROL} ${fallo ? 'border-red-500' : ''} ${
          bruto === null ? 'cursor-not-allowed bg-zinc-100 dark:bg-zinc-800' : ''
        }`}
      />
      <span className={`text-xs ${fallo ? 'text-red-600 dark:text-red-400' : 'text-tenue'}`}>
        {bruto === null
          ? 'Se calcula al poner la cantidad y el precio'
          : (fallo ??
            (descuento > 0
              ? `${numero(bruto)} a precio de lista · descuento de ${numero(descuento)}`
              : minimo !== null
                ? `Son ${numero(bruto)}. Puede bajarlo hasta ${numero(minimo)} (${tope} % de descuento)`
                : `Son ${numero(bruto)}. Cámbielo si acordó otra cifra con el cliente`))}
      </span>
    </label>
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
  topeDescuento,
}: {
  ventaId: number;
  /** Código de la moneda de la venta, para rotular el precio. */
  moneda: string;
  /** VEN-07: tope de descuento del rol de quien vende. `null` = sin tope. */
  topeDescuento?: number | null;
}) {
  const [articulo, setArticulo] = useState<ArticuloEncontrado | null>(null);
  const [zonaId, setZonaId] = useState('');
  const [lista, setLista] = useState<PrecioDeLista | null>(null);
  // Cajas y precio se siguen aquí porque el subtotal se calcula con los dos.
  const [cajas, setCajas] = useState<number | null>(CAJAS_POR_DEFECTO);
  const [precioEscrito, setPrecioEscrito] = useState<number | null>(null);

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
        alCambiar={setCajas}
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
        unidad={articulo?.unidad ?? null}
        claveCampo={`${articulo?.id ?? 0}-${lista?.precioVenta ?? 'libre'}`}
        alEscribir={setPrecioEscrito}
      />

      <CampoSubtotal
        cajas={cajas}
        precio={lista?.precioVenta ?? precioEscrito}
        moneda={moneda}
        tope={topeDescuento}
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
            <strong>{numero(elegida.cantidad)}</strong>{' '}
            {nombreEnvase(articulo?.unidad ?? null, elegida.cantidad)} de{' '}
            {numero(articulo?.unidadesPorCaja ?? 0)} {piezas(articulo?.unidadesPorCaja ?? 0)}.
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
  /** VEN-07: lo que ya se rebajó en esta línea. */
  descuento: number;
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
  topeDescuento,
}: {
  ventaId: number;
  linea: LineaVenta;
  /** Todas las zonas donde ese empaque tiene existencia hoy. */
  existencias: ExistenciaZona[];
  moneda: string;
  /** VEN-07: tope de descuento del rol de quien vende. `null` = sin tope. */
  topeDescuento?: number | null;
}) {
  const [zonaId, setZonaId] = useState(String(linea.zonaId));
  const [lista, setLista] = useState<PrecioDeLista | null>(null);
  const [cajas, setCajas] = useState<number | null>(linea.cajas);
  const [precioEscrito, setPrecioEscrito] = useState<number | null>(linea.precioCaja);

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
          {nombreEnvase(linea.unidad)} de {numero(linea.unidadesPorCaja)}{' '}
          {piezas(linea.unidadesPorCaja)}
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
        alCambiar={setCajas}
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
        unidad={linea.unidad}
        valorActual={linea.precioCaja}
        claveCampo={`${linea.id}-${lista?.precioVenta ?? 'libre'}`}
        alEscribir={setPrecioEscrito}
      />

      <CampoSubtotal
        cajas={cajas}
        precio={lista?.precioVenta ?? precioEscrito}
        moneda={moneda}
        descuentoInicial={linea.descuento}
        tope={topeDescuento}
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
