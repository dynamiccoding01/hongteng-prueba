import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tarjeta, Vacio } from '@/components/ui';
import { FormularioDesplegable, Campo } from '@/components/formulario';
import { MatrizPermisos, type ModuloPermisos } from '@/components/matriz-permisos';
import { crearRol } from './acciones';

export const metadata = { title: 'Roles y permisos · Inventario' };

/**
 * ADM-01: administra la cadena usuario → rol → rol_permiso ← permiso.
 * La matriz es editable (marcar/desmarcar asigna o quita permisos) y se pueden
 * crear roles. RLS decide qué roles se ven: un Administrador no ve los roles
 * protegidos (Superadmin); un Superadmin los ve todos.
 */
export default async function Roles() {
  const usuario = await requerirPermiso('rol.editar');
  const puedeEditar = usuario.permisos.has('rol.editar');

  const supabase = await crearClienteServidor();

  const [{ data: roles, error }, { data: permisos }, { data: asignaciones }] = await Promise.all([
    supabase
      .from('rol')
      .select('id, nombre, descripcion, activo, acceso_total, protegido')
      .order('nombre'),
    supabase.from('permiso').select('id, codigo, modulo, descripcion').order('codigo'),
    supabase.from('rol_permiso').select('rol_id, permiso_id'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los roles: {error.message}</Vacio>;

  // Permisos agrupados por módulo, respetando el orden de aparición.
  const modulos: ModuloPermisos[] = [];
  for (const p of permisos ?? []) {
    let grupo = modulos.find((m) => m.modulo === p.modulo);
    if (!grupo) {
      grupo = { modulo: p.modulo, permisos: [] };
      modulos.push(grupo);
    }
    grupo.permisos.push({ id: p.id, codigo: p.codigo, descripcion: p.descripcion });
  }

  const asignadasIniciales = (asignaciones ?? []).map((a) => `${a.rol_id}:${a.permiso_id}`);
  const conteo = new Map<number, number>();
  for (const a of asignaciones ?? []) conteo.set(a.rol_id, (conteo.get(a.rol_id) ?? 0) + 1);

  return (
    <>
      <Encabezado
        titulo="Roles y permisos"
        descripcion="Un usuario tiene un rol; cada rol agrupa muchos permisos (ADM-01)"
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={crearRol} etiquetaNuevo="Nuevo rol">
            <Campo etiqueta="Nombre" nombre="nombre" requerido ejemplo="Ej. Supervisor" />
            <Campo etiqueta="Descripción" nombre="descripcion" ejemplo="Para qué sirve el rol" />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      <Tarjeta className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Los permisos se verifican en la base de datos con políticas RLS, no solo en la interfaz.
        Marcar o desmarcar una casilla cambia de inmediato lo que pueden hacer todos los usuarios de
        ese rol.
      </Tarjeta>

      <MatrizPermisos
        roles={roles ?? []}
        modulos={modulos}
        asignadasIniciales={asignadasIniciales}
        puedeEditar={puedeEditar}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        {(roles ?? []).map((r) => (
          <Tarjeta key={r.id} className="text-sm">
            <p className="font-medium">
              {r.nombre}{' '}
              {r.acceso_total ? (
                <Etiqueta tono="ambar">acceso total</Etiqueta>
              ) : (
                <Etiqueta tono="neutro">{conteo.get(r.id) ?? 0} permisos</Etiqueta>
              )}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{r.descripcion}</p>
          </Tarjeta>
        ))}
      </div>
    </>
  );
}
