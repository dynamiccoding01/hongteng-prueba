/**
 * Parser de la columna 区域 (zona) de BODEGA.xls.
 *
 * En la planilla del cliente la ubicacion es texto libre y 179 de 242 valores
 * distintos son compuestos: un mismo articulo esta repartido en varias zonas
 * con la cantidad entre parentesis.
 *
 *   '1-4'            -> toda la existencia en la zona 1-4
 *   '1-3 (2)M3(1)'   -> 2 cajas en la zona 1-3 y 1 caja en M3
 *   '1-5(11) 4-6'    -> 11 cajas en 1-5 y el resto en 4-6
 *
 * Cuando el valor es ambiguo NO se adivina: se devuelve un error para que la
 * fila entre al reporte de excepciones y la revise una persona.
 */

/** Codigo de zona valido: 1-4, 3-8, M2, M2-4, M-3, 02, 124. */
const CODIGO_ZONA = /^[A-Z]*-?\d+(?:-\d+)?$/;

/** Un codigo de zona, opcionalmente seguido de la cantidad entre parentesis. */
const TOKEN = /([A-Za-z]*-?\d+(?:-\d+)?)\s*(?:\((\d+)\))?/g;

export interface AsignacionZona {
  /** Codigo normalizado de la zona, ej. 'M2-4'. */
  zona: string;
  /** Cajas ubicadas en esa zona. */
  cajas: number;
}

export type ResultadoZona =
  | {
      ok: true;
      asignaciones: AsignacionZona[];
      /**
       * true si las cantidades anotadas por zona suman exactamente la existencia
       * de la fila. En la planilla real esto NO siempre ocurre: las anotaciones
       * entre parentesis quedaron desactualizadas respecto de 实存. Cuando es
       * false la fila se carga igual, pero queda marcada para revision.
       */
      reconcilia: boolean;
      /** cantidades anotadas − existencia. 0 cuando reconcilia. */
      diferencia: number;
    }
  | { ok: false; motivo: string };

/** Normaliza un codigo de zona: sin espacios, en mayusculas. */
export function normalizarCodigoZona(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * La planilla se escribio con teclado chino, asi que algunas filas traen
 * parentesis, guiones y espacios de ancho completo: 'M3 1-2（3）'. Son los
 * mismos caracteres, en otro punto de codigo.
 */
function normalizarAnchoCompleto(texto: string): string {
  return texto
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[－—–]/g, '-')
    .replace(/[　 ]/g, ' ')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/**
 * Interpreta el valor de la columna 区域.
 *
 * @param crudo      Valor tal como viene de la planilla.
 * @param totalCajas Existencia (实存) de la fila, para repartir el remanente.
 */
export function parseZona(crudo: string | null | undefined, totalCajas: number): ResultadoZona {
  const texto = normalizarAnchoCompleto(crudo ?? '').trim();

  if (texto === '') {
    return { ok: false, motivo: 'zona vacia' };
  }
  if (!Number.isFinite(totalCajas) || totalCajas < 0) {
    return { ok: false, motivo: `total de cajas invalido: ${totalCajas}` };
  }

  const tokens: { zona: string; cajas: number | null }[] = [];
  TOKEN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(texto)) !== null) {
    const [completo, codigoCrudo, cantidad] = match;

    // Evita bucle infinito ante una coincidencia vacia.
    if (completo === '') {
      TOKEN.lastIndex += 1;
      continue;
    }

    // Un token nuevo solo puede empezar tras un espacio o tras un ')'.
    // Si empieza pegado al anterior, el valor es ambiguo: '1-63-6(1)' tanto
    // puede ser '1-6' + '3-6(1)' como '1-63' + '-6(1)'. No se adivina.
    if (match.index > 0) {
      const anterior = texto[match.index - 1] ?? '';
      if (!/[\s)]/.test(anterior)) {
        return { ok: false, motivo: `zona ambigua, codigos sin separador: '${texto}'` };
      }
    }

    const zona = normalizarCodigoZona(codigoCrudo ?? '');
    if (!CODIGO_ZONA.test(zona)) {
      return { ok: false, motivo: `codigo de zona no reconocido: '${codigoCrudo}' en '${texto}'` };
    }

    tokens.push({ zona, cajas: cantidad === undefined ? null : Number(cantidad) });
  }

  if (tokens.length === 0) {
    return { ok: false, motivo: `no se reconocio ninguna zona en '${texto}'` };
  }

  const sinCantidad = tokens.filter((t) => t.cajas === null);
  const asignado = tokens.reduce((suma, t) => suma + (t.cajas ?? 0), 0);

  // Caso simple: una sola zona sin cantidad -> toda la existencia va ahi.
  if (tokens.length === 1 && sinCantidad.length === 1) {
    return {
      ok: true,
      asignaciones: [{ zona: tokens[0]!.zona, cajas: totalCajas }],
      reconcilia: true,
      diferencia: 0,
    };
  }

  if (sinCantidad.length > 1) {
    return {
      ok: false,
      motivo: `hay ${sinCantidad.length} zonas sin cantidad, no se puede repartir: '${texto}'`,
    };
  }

  // Una zona sin cantidad: recibe el remanente (0 si las anotaciones se pasan).
  if (sinCantidad.length === 1) {
    const remanente = totalCajas - asignado;
    return {
      ok: true,
      asignaciones: tokens.map((t) => ({ zona: t.zona, cajas: t.cajas ?? Math.max(remanente, 0) })),
      reconcilia: remanente >= 0,
      diferencia: remanente >= 0 ? 0 : -remanente,
    };
  }

  // Todas con cantidad: se respeta lo anotado y se informa si no cuadra con 实存.
  return {
    ok: true,
    asignaciones: tokens.map((t) => ({ zona: t.zona, cajas: t.cajas! })),
    reconcilia: asignado === totalCajas,
    diferencia: asignado - totalCajas,
  };
}
