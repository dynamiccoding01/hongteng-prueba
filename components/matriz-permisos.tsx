'use client';

import { Fragment, useState, useTransition } from 'react';
import { alternarPermiso } from '@/app/(app)/admin/roles/acciones';

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  acceso_total: boolean;
  protegido: boolean;
}

export interface Permiso {
  id: number;
  codigo: string;
  descripcion: string;
}

export interface ModuloPermisos {
  modulo: string;
  permisos: Permiso[];
}

const clave = (rolId: number, permisoId: number) => `${rolId}:${permisoId}`;

/**
 * Matriz editable rol × permiso. Cada celda editable es una casilla que
 * inserta o borra una fila en `rol_permiso`. La actualización es optimista: se
 * pinta el cambio de inmediato y, si la base lo rechaza, se revierte.
 *
 * Los roles de acceso total (Superadmin) se muestran con todo marcado y bloqueado:
 * su acceso no depende de filas en rol_permiso, así que no hay nada que editar.
 */
export function MatrizPermisos({
  roles,
  modulos,
  asignadasIniciales,
  puedeEditar,
}: {
  roles: Rol[];
  modulos: ModuloPermisos[];
  asignadasIniciales: string[];
  puedeEditar: boolean;
}) {
  const [asignadas, setAsignadas] = useState<Set<string>>(() => new Set(asignadasIniciales));
  const [pendiente, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  function alternar(rol: Rol, permisoId: number) {
    if (!puedeEditar || rol.acceso_total) return;

    const k = clave(rol.id, permisoId);
    const activar = !asignadas.has(k);

    // Optimista: refleja el cambio ya.
    setAsignadas((prev) => {
      const copia = new Set(prev);
      if (activar) copia.add(k);
      else copia.delete(k);
      return copia;
    });
    setMensaje(null);

    startTransition(async () => {
      const r = await alternarPermiso(rol.id, permisoId, activar);
      if (r.error) {
        // Revierte si la base rechazó el cambio.
        setAsignadas((prev) => {
          const copia = new Set(prev);
          if (activar) copia.delete(k);
          else copia.add(k);
          return copia;
        });
        setMensaje({ texto: r.error, error: true });
      } else if (r.ok) {
        setMensaje({ texto: r.ok, error: false });
      }
    });
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-500 dark:border-zinc-800">
                Permiso
              </th>
              {roles.map((r) => (
                <th
                  key={r.id}
                  className="border-b border-zinc-200 px-3 py-2 text-center font-medium dark:border-zinc-800"
                >
                  {r.nombre}
                  {r.acceso_total ? (
                    <span className="ml-1 text-xs font-normal text-zinc-400">(total)</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modulos.map(({ modulo, permisos }) => (
              <Fragment key={modulo}>
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs font-medium tracking-wider text-zinc-500 uppercase dark:border-zinc-900 dark:bg-zinc-900"
                  >
                    {modulo}
                  </td>
                </tr>
                {permisos.map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                      <code className="text-xs">{p.codigo}</code>
                      <span className="ml-2 text-xs text-zinc-500">{p.descripcion}</span>
                    </td>
                    {roles.map((r) => {
                      const marcado = r.acceso_total || asignadas.has(clave(r.id, p.id));
                      const editable = puedeEditar && !r.acceso_total;
                      return (
                        <td
                          key={r.id}
                          className="border-b border-zinc-100 px-3 py-2 text-center dark:border-zinc-900"
                        >
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={pendiente}
                              onChange={() => alternar(r, p.id)}
                              aria-label={`${p.codigo} para ${r.nombre}`}
                              className="size-4 cursor-pointer accent-acento disabled:cursor-wait"
                            />
                          ) : marcado ? (
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {mensaje ? (
        <p
          role={mensaje.error ? 'alert' : undefined}
          className={`mt-3 text-sm ${
            mensaje.error
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
}
