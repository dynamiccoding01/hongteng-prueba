import { Tarjeta } from '@/components/ui';

export interface OpcionProveedor {
  id: number;
  nombre: string;
}

const CLASE_CONTROL =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900';

/**
 * Filtros del historial de importaciones.
 *
 * Mismo patrón que los de la bitácora: un `<form method="get">` sin JavaScript.
 * Al enviar, la URL se rearma solo con estos campos, así que `pagina` se pierde
 * y el resultado arranca en la primera —lo correcto tras filtrar, porque la
 * página 7 del listado anterior no existe en el nuevo—. El tamaño elegido sí se
 * conserva.
 */
export function Filtros({
  desde,
  hasta,
  proveedorId,
  documento,
  proveedores,
  porPagina,
}: {
  desde: string;
  hasta: string;
  proveedorId: string;
  documento: string;
  proveedores: OpcionProveedor[];
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
          <span className="font-medium">Proveedor</span>
          <select name="proveedor" defaultValue={proveedorId} className={CLASE_CONTROL}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Documento de aduana</span>
          <input
            type="text"
            name="documento"
            defaultValue={documento}
            placeholder="203-2026-001234"
            maxLength={40}
            className={CLASE_CONTROL}
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Filtrar
        </button>

        <a
          href="/compras/confirmadas"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Limpiar
        </a>
      </form>
    </Tarjeta>
  );
}
