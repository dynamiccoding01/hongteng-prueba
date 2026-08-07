import { Tarjeta } from '@/components/ui';

export interface OpcionUsuario {
  id: string;
  nombre: string;
}

const CLASE_CONTROL =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900';

/**
 * Filtros de la bitácora.
 *
 * Es un `<form method="get">` a secas, sin JavaScript: al enviar recarga la
 * página con los filtros en la URL y el Server Component los lee de
 * `searchParams`. Como el estado vive en la URL, un filtro concreto se puede
 * guardar en favoritos o pasar por chat.
 */
export function Filtros({
  desde,
  hasta,
  usuarioId,
  accion,
  usuarios,
  acciones,
  porPagina,
}: {
  desde: string;
  hasta: string;
  usuarioId: string;
  accion: string;
  usuarios: OpcionUsuario[] | null;
  acciones: string[];
  porPagina: number;
}) {
  return (
    <Tarjeta className="mb-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {/*
         * Al enviar, la URL se rearma solo con estos campos: `pagina` se pierde
         * y el resultado arranca en la primera, que es lo correcto tras filtrar.
         * El tamaño elegido sí se conserva.
         */}
        <input type="hidden" name="filas" value={porPagina} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            max={hasta}
            className={CLASE_CONTROL}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            min={desde}
            className={CLASE_CONTROL}
          />
        </label>

        {usuarios ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Usuario</span>
            <select name="usuario" defaultValue={usuarioId} className={CLASE_CONTROL}>
              <option value="">Todos los usuarios</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Acción</span>
          <select name="accion" defaultValue={accion} className={CLASE_CONTROL}>
            <option value="">Todas</option>
            {acciones.map((a) => (
              <option key={a} value={a}>
                {a}
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
          href="/bitacora"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
        >
          Limpiar
        </a>
      </form>
    </Tarjeta>
  );
}
