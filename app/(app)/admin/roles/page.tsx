import { Fragment } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tarjeta, Vacio } from '@/components/ui';

export const metadata = { title: 'Roles y permisos · Inventario' };

/**
 * ADM-01: muestra la cadena usuario → rol → rol_permiso ← permiso.
 * De momento es de consulta; la edición de asignaciones entra en el Sprint 2.
 */
export default async function Roles() {
  await requerirPermiso('rol.editar');

  const supabase = await crearClienteServidor();

  const [{ data: roles, error }, { data: permisos }, { data: asignaciones }] = await Promise.all([
    supabase.from('rol').select('id, nombre, descripcion, activo').order('nombre'),
    supabase.from('permiso').select('id, codigo, modulo, descripcion').order('codigo'),
    supabase.from('rol_permiso').select('rol_id, permiso_id'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los roles: {error.message}</Vacio>;

  const porRol = new Map<number, Set<number>>();
  for (const a of asignaciones ?? []) {
    const conjunto = porRol.get(a.rol_id) ?? new Set<number>();
    conjunto.add(a.permiso_id);
    porRol.set(a.rol_id, conjunto);
  }

  const modulos = [...new Set((permisos ?? []).map((p) => p.modulo))];

  return (
    <>
      <Encabezado
        titulo="Roles y permisos"
        descripcion="Un usuario tiene un rol; cada rol agrupa muchos permisos (ADM-01)"
      />

      <Tarjeta className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Los permisos se verifican en la base de datos con políticas RLS, no solo en la interfaz.
        Cambiar lo que puede hacer un rol afecta de inmediato a todos sus usuarios.
      </Tarjeta>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-500 dark:border-zinc-800">
                Permiso
              </th>
              {(roles ?? []).map((r) => (
                <th
                  key={r.id}
                  className="border-b border-zinc-200 px-3 py-2 text-center font-medium dark:border-zinc-800"
                >
                  {r.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modulos.map((modulo) => (
              // La key va en el Fragment, no en el <tr>: si no, React advierte
              // por cada grupo de permisos.
              <Fragment key={modulo}>
                <tr>
                  <td
                    colSpan={(roles ?? []).length + 1}
                    className="border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs font-medium tracking-wider text-zinc-500 uppercase dark:border-zinc-900 dark:bg-zinc-900"
                  >
                    {modulo}
                  </td>
                </tr>
                {(permisos ?? [])
                  .filter((p) => p.modulo === modulo)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                        <code className="text-xs">{p.codigo}</code>
                        <span className="ml-2 text-xs text-zinc-500">{p.descripcion}</span>
                      </td>
                      {(roles ?? []).map((r) => (
                        <td
                          key={r.id}
                          className="border-b border-zinc-100 px-3 py-2 text-center dark:border-zinc-900"
                        >
                          {porRol.get(r.id)?.has(p.id) ? (
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {(roles ?? []).map((r) => (
          <Tarjeta key={r.id} className="text-sm">
            <p className="font-medium">
              {r.nombre} <Etiqueta tono="neutro">{porRol.get(r.id)?.size ?? 0} permisos</Etiqueta>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{r.descripcion}</p>
          </Tarjeta>
        ))}
      </div>
    </>
  );
}
