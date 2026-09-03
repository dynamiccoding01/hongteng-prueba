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
 */

/** Los cuatro decimales de `numeric(14, 4)`, que es como se guarda el dinero. */
const DECIMALES = 4;

/**
 * Redondea a los decimales que admite la columna.
 *
 * Sin esto, 3 cajas a 19,90 dan 59,699999999999996 en coma flotante y el
 * descuento saldría con basura al final, o —peor— un subtotal escrito igual al
 * bruto se leería como una rebaja de 0,0000000001.
 */
export function redondearDinero(valor: number): number {
  const factor = 10 ** DECIMALES;
  return Math.round(valor * factor) / factor;
}

/** Lo que costaría la línea a precio de lista, sin rebajar nada. */
export function subtotalBruto(cajas: number, precioCaja: number | null): number | null {
  if (precioCaja === null || !Number.isFinite(cajas) || !Number.isFinite(precioCaja)) return null;
  return redondearDinero(cajas * precioCaja);
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
 */
export function descuentoParaSubtotal(
  cajas: number,
  precioCaja: number | null,
  subtotalPedido: number | undefined,
): ResultadoDescuento {
  // Sin precio no hay nada que rebajar. La línea puede existir así: el precio
  // se pone después, y hasta entonces el subtotal es «todavía no se sabe».
  const bruto = subtotalBruto(cajas, precioCaja);
  if (bruto === null) return { descuento: 0 };

  if (subtotalPedido === undefined) return { descuento: 0 };

  if (!Number.isFinite(subtotalPedido) || subtotalPedido < 0) {
    return { error: 'El subtotal no puede ser negativo' };
  }

  const pedido = redondearDinero(subtotalPedido);

  if (pedido > bruto) {
    return {
      error:
        `El subtotal no puede superar los ${bruto} de la línea: esto es para rebajar, ` +
        'no para subir el precio. Para cobrar más, cambie el precio por caja',
    };
  }

  return { descuento: redondearDinero(bruto - pedido) };
}
