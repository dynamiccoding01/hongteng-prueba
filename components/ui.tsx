/**
 * Componentes de interfaz compartidos. Deliberadamente pequeños: mantienen
 * consistente el aspecto sin esconder el HTML detrás de abstracciones.
 */

export function Encabezado({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion ? <p className="mt-1 text-sm text-tenue">{descripcion}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/** Contenedor de tarjeta reutilizable, para las secciones que antes armaban el borde a mano. */
export function Tarjeta({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-borde bg-superficie p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Tabla({ children }: { children: React.ReactNode }) {
  // El contenedor limita la altura: una tabla larga hace scroll dentro de la
  // caja y su encabezado (Th, con `sticky top-0`) queda fijo arriba. Una tabla
  // corta no llega al límite, así que no aparece scroll ni cambia nada. El
  // resaltado de fila se aplica con un selector sobre `tbody tr`, para que todas
  // las tablas lo hereden sin tocar cada `<tr>`.
  return (
    <div className="max-h-[calc(100vh-11rem)] overflow-auto rounded-xl border border-borde bg-superficie">
      <table className="w-full text-sm [&_tbody_tr:hover]:bg-black/[0.025] dark:[&_tbody_tr:hover]:bg-white/[0.04]">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, numerico }: { children: React.ReactNode; numerico?: boolean }) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-borde bg-zinc-100 px-3 py-2 font-medium text-tenue dark:bg-zinc-900 ${
        numerico ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numerico,
  tenue,
}: {
  children: React.ReactNode;
  numerico?: boolean;
  tenue?: boolean;
}) {
  return (
    <td
      className={`border-b border-borde/60 px-3 py-2 ${
        numerico ? 'text-right tabular-nums' : ''
      } ${tenue ? 'text-tenue' : ''}`}
    >
      {children}
    </td>
  );
}

export function Etiqueta({
  children,
  tono = 'neutro',
}: {
  children: React.ReactNode;
  tono?: 'neutro' | 'verde' | 'rojo' | 'ambar';
}) {
  const tonos = {
    neutro: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    rojo: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    ambar: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  } as const;

  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${tonos[tono]}`}>
      {children}
    </span>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-borde px-6 py-12 text-center text-sm text-tenue">
      {children}
    </div>
  );
}

/** Formatea cantidades con separador de miles en formato chileno. */
export function numero(valor: number | string | null): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  return new Intl.NumberFormat('es-CL').format(n);
}
