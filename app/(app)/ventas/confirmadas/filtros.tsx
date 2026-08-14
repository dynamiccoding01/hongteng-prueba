import { Tarjeta } from '@/components/ui';

export interface OpcionCliente {
  id: number;
  nombre: string;
}

const CLASE_CONTROL =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900';

/**
 * Filtros del historial de ventas. Mismo patrón que los de compras y bitácora:
 * un `<form method="get">` sin JavaScript, con el estado en la URL. Al enviar,
 * `pagina` se pierde y el resultado arranca en la primera.
 */
export function Filtros({
  desde,
  hasta,
  clienteId,
  clientes,
  porPagina,
}: {
  desde: string;
  hasta: string;
  clienteId: string;
  clientes: OpcionCliente[];
  porPagina: number;
}) {
  return (
    <Tarjeta className="mb-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="filas" value={porPagina} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            max={hasta || undefined}
            className={CLASE_CONTROL}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            min={desde || undefined}
            className={CLASE_CONTROL}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Cliente</span>
          <select name="cliente" defaultValue={clienteId} className={CLASE_CONTROL}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-md bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>

        <a
          href="/ventas/confirmadas"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Limpiar
        </a>
      </form>
    </Tarjeta>
  );
}
