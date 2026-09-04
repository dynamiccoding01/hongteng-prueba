/**
 * VEN-07: el descuento que se acuerda articulo por articulo.
 *
 * En el mostrador nadie negocia porcentajes ni precios unitarios: se mira el
 * subtotal de la linea —«son 5.950»— y el cliente pide una cifra redonda,
 * «dejemelo en 5.900». Por eso lo que se escribe en pantalla es el subtotal
 * final, y lo que se guarda es la rebaja: `venta_detalle.descuento`.
 *
 * Guardar la rebaja y no el subtotal es a propósito. `precio_caja` tiene que
 * seguir siendo el precio de lista para que dos ventas sigan siendo
 * comparables y para que se pueda responder «cuánto se rebajó», que con un
 * subtotal ya machacado habría que reconstruir. La resta la hace la base en la
 * columna generada `venta_detalle.subtotal`.
 *
 * ---------------------------------------------------------------------------
 * Por qué esta cuenta se hace en enteros
 * ---------------------------------------------------------------------------
 * La primera versión multiplicaba en coma flotante y redondeaba a cuatro
 * decimales. PostgreSQL no: multiplica `cajas numeric(14,2)` por
 * `precio_caja numeric(14,4)` en aritmética decimal exacta, y el resultado
 * tiene hasta **seis** decimales. Cuando el redondeo subía, el descuento
 * quedaba por encima del importe real y `venta_detalle_descuento_ck` rechazaba
 * la línea con jerga de PostgreSQL:
 *
 *     0,05 cajas × 20,0010 → importe exacto 1,000050
 *                            descuento enviado 1,0001  → subtotal −0,0001
 *
 * Aquí se trabaja con la misma unidad que la base —millonésimas, que son las
 * dos décimas de la cantidad más las cuatro del precio— y en `bigint`, que no
 * tiene un límite de precisión que se pueda cruzar sin avisar. La rebaja final
 * se **trunca hacia abajo** a los cuatro decimales de la columna: recortar a la
 * baja cobra como mucho una diezmilésima de más, mientras que redondear al
 * cercano puede cobrar de menos, y eso es un descuento que nadie decidió.
 */

/** Decimales de `venta_detalle.cajas`, que es `numeric(14, 2)`. */
const DECIMALES_CAJAS = 2;

/** Decimales de `precio_caja`, `descuento` y `subtotal`: `numeric(14, 4)`. */
const DECIMALES_DINERO = 4;

/** `numeric(14, n)` guarda 14 dígitos en total: este es el primero que no cabe. */
const MAXIMO_CAJAS = 10 ** (14 - DECIMALES_CAJAS);
const MAXIMO_DINERO = 10 ** (14 - DECIMALES_DINERO);

/** De diezmilésimas (dinero) a millonésimas (importe de la línea). */
const DINERO_A_IMPORTE = 10n ** BigInt(DECIMALES_CAJAS);

export const MENSAJE_CANTIDAD =
  'La cantidad debe ser mayor que cero y con dos decimales como máximo: ' +
  'es lo que guarda el sistema, y con más se cobraría una cifra distinta de la acordada';

export const MENSAJE_PRECIO =
  'El precio por caja admite cuatro decimales como máximo y no puede ser negativo';

/**
 * Cuántos decimales tiene un número, leídos de su representación más corta.
 *
 * `toString` devuelve la que vuelve a dar el mismo número, así que para un
 * valor que salió de un formulario es exactamente lo que se tecleó: 1,005 son
 * tres decimales y no dos con basura detrás. La notación científica se cuenta
 * como «más de los que caben», que es lo que es para estas columnas.
 */
function decimalesDe(valor: number): number {
  const texto = String(valor);
  if (texto.includes('e') || texto.includes('E')) return Number.POSITIVE_INFINITY;
  const punto = texto.indexOf('.');
  return punto === -1 ? 0 : texto.length - punto - 1;
}

/**
 * Pasa un número a la unidad entera de su columna, o `null` si no cabe en ella.
 *
 * Rechazar es la gracia: `numeric(14,2)` redondea 1,005 a 1,01 sin decir nada,
 * y a partir de ahí lo cobrado deja de ser lo acordado.
 */
function aEntero(valor: number, decimales: number, maximo: number): bigint | null {
  if (!Number.isFinite(valor) || valor < 0 || valor >= maximo) return null;
  if (decimalesDe(valor) > decimales) return null;
  // El valor tiene como mucho `decimales` decimales y está acotado, así que el
  // producto está a menos de un ulp del entero que le toca: `round` lo recupera.
  return BigInt(Math.round(valor * 10 ** decimales));
}

/** Cantidad de cajas en centésimas. Cero no es una cantidad: es una línea vacía. */
function aCantidad(cajas: number): bigint | null {
  const entero = aEntero(cajas, DECIMALES_CAJAS, MAXIMO_CAJAS);
  return entero === null || entero === 0n ? null : entero;
}

/** Un importe en diezmilésimas. El cero sí vale: hay artículos a precio cero. */
function aDinero(valor: number): bigint | null {
  return aEntero(valor, DECIMALES_DINERO, MAXIMO_DINERO);
}

/** De millonésimas al número que se muestra y se guarda. */
function comoNumero(importe: bigint, decimales: number): number {
  return Number(importe) / 10 ** decimales;
}

/**
 * Lo que costaría la línea a precio de lista, sin rebajar nada.
 *
 * Es el mismo producto exacto que calcula PostgreSQL, no una aproximación:
 * `null` cuando todavía no hay precio, y también cuando la cantidad o el precio
 * no son de los que la base puede guardar.
 */
export function subtotalBruto(cajas: number, precioCaja: number | null): number | null {
  if (precioCaja === null) return null;

  const cantidad = aCantidad(cajas);
  const precio = aDinero(precioCaja);
  if (cantidad === null || precio === null) return null;

  return comoNumero(cantidad * precio, DECIMALES_CAJAS + DECIMALES_DINERO);
}

/**
 * El subtotal que queda al aplicar una rebaja ya acordada.
 *
 * Es lo que se escribe en el campo «Subtotal» al abrir una línea guardada, y se
 * calcula con la misma aritmética entera que el resto para que lo que se ve sea
 * exactamente lo que vuelve a guardarse si nadie lo toca.
 *
 * Una rebaja que ya no cabe en la línea se muestra como el bruto —sin rebajar—:
 * el aviso de que la rebaja se quedó sin sitio lo da la acción al guardar, no
 * este número.
 */
export function subtotalConDescuento(
  cajas: number,
  precioCaja: number | null,
  descuento: number,
): number | null {
  if (precioCaja === null) return null;

  const cantidad = aCantidad(cajas);
  const precio = aDinero(precioCaja);
  if (cantidad === null || precio === null) return null;

  const bruto = cantidad * precio;
  const rebaja = aDinero(descuento);
  const decimales = DECIMALES_CAJAS + DECIMALES_DINERO;

  if (rebaja === null || rebaja * DINERO_A_IMPORTE > bruto) return comoNumero(bruto, decimales);

  return comoNumero(bruto - rebaja * DINERO_A_IMPORTE, decimales);
}

export type ResultadoDescuento = { descuento: number } | { error: string };

/**
 * Cuánto hay que rebajar para que la línea quede en el subtotal acordado.
 *
 * `subtotalPedido` es lo que se escribió en el formulario: `undefined` cuando
 * no se tocó el campo, que es el caso normal y significa sin descuento.
 *
 * Devuelve un error en vez de recortar en silencio cuando el subtotal pedido
 * supera al de lista: eso ya no es una rebaja sino un recargo, y subir un
 * precio no se hace por esta puerta —se cambia el precio por caja, o la lista
 * del cliente—. Aceptarlo como «descuento negativo» dejaría a `precio_caja`
 * diciendo una cosa y al cobro diciendo otra.
 *
 * También protesta si la cantidad o el precio no son de los que la base sabe
 * guardar. Callarse ahí sería peor que el error: la línea se guardaría con
 * otras cifras que las que se acordaron con el cliente.
 */
export function descuentoParaSubtotal(
  cajas: number,
  precioCaja: number | null,
  subtotalPedido: number | undefined,
): ResultadoDescuento {
  const cantidad = aCantidad(cajas);
  if (cantidad === null) return { error: MENSAJE_CANTIDAD };

  // Sin precio no hay nada que rebajar. La línea puede existir así: el precio
  // se pone después, y hasta entonces el subtotal es «todavía no se sabe».
  if (precioCaja === null) return { descuento: 0 };

  const precio = aDinero(precioCaja);
  if (precio === null) return { error: MENSAJE_PRECIO };

  if (subtotalPedido === undefined) return { descuento: 0 };

  if (!Number.isFinite(subtotalPedido) || subtotalPedido < 0) {
    return { error: 'El subtotal no puede ser negativo' };
  }

  const pedido = aDinero(subtotalPedido);
  if (pedido === null) {
    return { error: 'El subtotal admite cuatro decimales como máximo' };
  }

  const bruto = cantidad * precio;
  const acordado = pedido * DINERO_A_IMPORTE;

  if (acordado > bruto) {
    const enPantalla = comoNumero(bruto, DECIMALES_CAJAS + DECIMALES_DINERO);
    return {
      error:
        `El subtotal no puede superar los ${enPantalla} de la línea: esto es para rebajar, ` +
        'no para subir el precio. Para cobrar más, cambie el precio por caja',
    };
  }

  // La división entre bigint trunca, que es justo lo que hace falta: con los
  // dos operandos positivos, recorta a la baja y el descuento nunca se pasa del
  // importe exacto que comprueba `venta_detalle_descuento_ck`.
  return { descuento: comoNumero((bruto - acordado) / DINERO_A_IMPORTE, DECIMALES_DINERO) };
}

/**
 * Lo mínimo que se puede cobrar por la línea con el tope del rol.
 *
 * `null` cuando no hay tope, o cuando todavía no hay cantidad y precio con los
 * que hacer la cuenta. Se usa para escribir el mínimo en el campo Subtotal, que
 * es donde se negocia: decir «hasta 5.355» sirve; decir «hasta un 10 %» obliga
 * a hacer la cuenta de cabeza delante del cliente.
 */
export function subtotalMinimo(
  cajas: number,
  precioCaja: number | null,
  topePorcentaje: number | null,
): number | null {
  if (topePorcentaje === null || precioCaja === null) return null;

  const cantidad = aCantidad(cajas);
  const precio = aDinero(precioCaja);
  if (cantidad === null || precio === null) return null;

  const bruto = cantidad * precio;
  const decimales = DECIMALES_CAJAS + DECIMALES_DINERO;

  return comoNumero(bruto - topeEnImporte(bruto, topePorcentaje), decimales);
}

/** Cuánto se puede rebajar de un importe dado, en la misma unidad que él. */
function topeEnImporte(bruto: bigint, topePorcentaje: number): bigint {
  // En enteros y por lo bajo, como el resto: el tope es un máximo, así que si
  // no cae justo hay que quedarse por debajo y no por encima.
  const porcentaje = BigInt(Math.round(topePorcentaje * 100));
  return (bruto * porcentaje) / 10_000n;
}

/**
 * VEN-07: comprueba el descuento contra el tope del rol de quien vende.
 *
 * Devuelve el mensaje de error, o `null` si la rebaja cabe. La barrera de
 * verdad es `fn_venta_detalle_tope_descuento` (migración 0035); esto existe
 * para decirlo con una frase que se pueda leer, y antes de intentar guardar.
 */
export function superaElTope(
  cajas: number,
  precioCaja: number | null,
  descuento: number,
  topePorcentaje: number | null,
): string | null {
  if (topePorcentaje === null || precioCaja === null || descuento <= 0) return null;

  const cantidad = aCantidad(cajas);
  const precio = aDinero(precioCaja);
  const rebaja = aDinero(descuento);
  if (cantidad === null || precio === null || rebaja === null) return null;

  const bruto = cantidad * precio;
  const maximo = topeEnImporte(bruto, topePorcentaje);

  if (rebaja * DINERO_A_IMPORTE <= maximo) return null;

  const decimales = DECIMALES_CAJAS + DECIMALES_DINERO;
  return (
    `Su rol admite hasta un ${topePorcentaje} % de descuento: en esta línea son ` +
    `${comoNumero(maximo, decimales)} como máximo, y se pidieron ${descuento}`
  );
}

/**
 * La rebaja que sigue en pie cuando se corrige una línea sin tocar el subtotal.
 *
 * Es el otro significado de «no vino el campo». Al **agregar** una línea
 * significa que no se rebajó nada; al **corregirla** significa que la rebaja
 * que ya se acordó con el cliente sigue siendo la misma, y volver a calcularla
 * como cero la borraría en silencio —cambiar la zona de despacho subiría el
 * total de la nota sin que nadie lo pidiera—.
 *
 * Lo que viaja es el importe de la rebaja, no el subtotal: si la línea pasa de
 * 7 cajas a 10, los 50 acordados siguen siendo 50. Arrastrar el subtotal, en
 * cambio, convertiría el cambio de cantidad en un descuento enorme.
 *
 * Si la rebaja ya no cabe en la línea —se bajó la cantidad, o el precio— se
 * devuelve un error en vez de recortarla por lo bajo: cuánto se cobra ahora es
 * una decisión de quien vende, no de esta función.
 */
export function descuentoVigente(
  cajas: number,
  precioCaja: number | null,
  descuentoActual: number,
): ResultadoDescuento {
  const cantidad = aCantidad(cajas);
  if (cantidad === null) return { error: MENSAJE_CANTIDAD };

  // Sin precio la base exige descuento 0 (`venta_detalle_descuento_ck`).
  if (precioCaja === null) return { descuento: 0 };

  const precio = aDinero(precioCaja);
  if (precio === null) return { error: MENSAJE_PRECIO };

  const rebaja = aDinero(descuentoActual);
  if (rebaja === null) return { error: 'La rebaja guardada no es un importe válido' };
  if (rebaja === 0n) return { descuento: 0 };

  const bruto = cantidad * precio;
  if (rebaja * DINERO_A_IMPORTE > bruto) {
    const enPantalla = comoNumero(bruto, DECIMALES_CAJAS + DECIMALES_DINERO);
    return {
      error:
        `La rebaja de ${descuentoActual} ya no cabe en esta línea, que ahora suma ${enPantalla}. ` +
        'Escriba el subtotal que corresponde',
    };
  }

  return { descuento: comoNumero(rebaja, DECIMALES_DINERO) };
}
