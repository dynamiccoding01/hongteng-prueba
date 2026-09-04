import { Tabla, Td, Th, numero } from '@/components/ui';

/**
 * Piezas compartidas por los reportes de ventas (REP-05) y compras (REP-07).
 *
 * Las dos páginas hacen lo mismo con distinto sustantivo: un filtro por fechas,
 * dos resúmenes del período y el detalle paginado. Antes cada una llevaba su
 * copia, y por eso el mismo fallo —el resumen se sumaba en TypeScript sobre una
 * consulta sin `limit`, que PostgREST cortaba en silencio— estaba en las dos.
 *
 * Ahora los totales los calcula la base (`fn_ventas_resumen`,
 * `fn_compras_resumen`, migración 0033) y aquí solo se pintan.
 */

/** Una fila del resumen tal como la devuelve la función de la base. */
export interface FilaResumen {
  agrupacion: string;
  clave: string;
  cajas: number;
  monto_clp: number;
  lineas: number;
  sin_importe: number;
}

/** La fila TOTAL, que la función devuelve siempre y en primer lugar. */
export function totalDelPeriodo(filas: FilaResumen[]): FilaResumen {
  return (
    filas.find((f) => f.agrupacion === 'TOTAL') ?? {
      agrupacion: 'TOTAL',
      clave: '',
      cajas: 0,
      monto_clp: 0,
      lineas: 0,
      sin_importe: 0,
    }
  );
}

/** Las filas de una agrupación concreta, ya ordenadas por monto desde la base. */
export function agrupadas(filas: FilaResumen[], agrupacion: string): FilaResumen[] {
  return filas.filter((f) => f.agrupacion === agrupacion);
}

/** Filtro de período. Es un `form` GET: la URL queda compartible. */
export function FiltroPeriodo({
  desde,
  hasta,
  filas,
}: {
  desde?: string | undefined;
  hasta?: string | undefined;
  /**
   * El tamaño de página elegido. Viaja como campo oculto porque un `form` GET
   * reescribe la query entera: sin esto, filtrar por fechas devolvía el listado
   * a 15 filas y se perdía la elección de quien mira.
   */
  filas: number;
}) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <input type="hidden" name="filas" value={filas} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Desde</span>
        <input
          type="date"
          name="desde"
          defaultValue={desde}
          className="rounded-md border border-borde px-3 py-2 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Hasta</span>
        <input
          type="date"
          name="hasta"
          defaultValue={hasta}
          className="rounded-md border border-borde px-3 py-2 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Filtrar
      </button>
    </form>
  );
}

/** Una de las dos tablas de resumen del período. */
export function TablaResumen({
  titulo,
  encabezado,
  filas,
  comoCodigo,
}: {
  titulo: string;
  encabezado: string;
  filas: FilaResumen[];
  /** Los códigos de artículo se leen mejor en monoespaciada. */
  comoCodigo?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">{titulo}</h2>
      <Tabla>
        <thead>
          <tr>
            <Th>{encabezado}</Th>
            <Th numerico>Cajas</Th>
            <Th numerico>Monto CLP</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <Td>{comoCodigo ? <code className="text-xs">{f.clave}</code> : f.clave}</Td>
              <Td numerico>{numero(f.cajas)}</Td>
              <Td numerico>$ {numero(f.monto_clp)}</Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </section>
  );
}

/**
 * Aviso de las líneas que no se pueden valorizar.
 *
 * Una venta sin precio o una compra sin costo daba `monto_clp` nulo, y la
 * página lo sumaba como cero: el total del encabezado se quedaba corto sin que
 * nada lo dijera. Desde 0032 no se pueden confirmar documentos así, pero los
 * históricos siguen ahí y hay que verlos.
 */
export function AvisoSinImporte({ cuantas, que }: { cuantas: number; que: string }) {
  if (cuantas === 0) return null;

  return (
    <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      {cuantas} línea(s) del período no tienen {que}, así que no entran en los montos de arriba. Son
      documentos confirmados antes de que el sistema lo exigiera.
    </p>
  );
}
