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
        {descripcion ? <p className="mt-1 text-sm text-zinc-500">{descripcion}</p> : null}
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
    <div className={`rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 ${className}`}>
      {children}
    </div>
  );
}

export function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, numerico }: { children: React.ReactNode; numerico?: boolean }) {
  return (
    <th
      className={`border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 ${
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
      className={`border-b border-zinc-100 px-3 py-2 dark:border-zinc-900 ${
        numerico ? 'text-right tabular-nums' : ''
      } ${tenue ? 'text-zinc-500' : ''}`}
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
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
      {children}
    </div>
  );
}

/** Formatea cantidades con separador de miles en formato chileno. */
export function numero(valor: number | string | null): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  return new Intl.NumberFormat('es-CL').format(n);
}
