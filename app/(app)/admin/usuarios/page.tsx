import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { FormularioDesplegable, Seleccion } from '@/components/formulario';
import { actualizarUsuario } from './acciones';

export const metadata = { title: 'Usuarios · Inventario' };

function fecha(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** ADM-01: usuarios del sistema y su rol. */
export default async function Usuarios() {
  const actual = await requerirPermiso('usuario.ver');
  const puedeEditar = actual.permisos.has('usuario.editar');

  const supabase = await crearClienteServidor();

  const [{ data: usuarios, error }, { data: roles }] = await Promise.all([
    supabase
      .from('usuario')
      .select('id, nombre, email, activo, ultimo_acceso, rol:rol_id(id, nombre)')
      .order('nombre'),
    supabase.from('rol').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los usuarios: {error.message}</Vacio>;

  const opcionesRol = (roles ?? []).map((r) => ({ valor: r.id, texto: r.nombre }));

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion="Acceso al sistema y rol asignado (ADM-01)" />

      <div className="mb-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        Las cuentas se crean desde el panel de Supabase (<em>Authentication → Users</em>). Este
        sistema no maneja contraseñas: solo asigna el rol. Un usuario nuevo entra con el rol{' '}
        <strong>Consulta</strong> hasta que un administrador lo cambie.
      </div>

      {(usuarios ?? []).length === 0 ? (
        <Vacio>No hay usuarios registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th>Último acceso</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {(usuarios ?? []).map((u) => (
              <tr key={u.id}>
                <Td>
                  {u.nombre}
                  {u.id === actual.id ? (
                    <span className="ml-2 text-xs text-zinc-500">(usted)</span>
                  ) : null}
                </Td>
                <Td tenue>{u.email}</Td>
                <Td>
                  <Etiqueta>{u.rol?.nombre ?? '—'}</Etiqueta>
                </Td>
                <Td tenue>{fecha(u.ultimo_acceso)}</Td>
                <Td>
                  <Etiqueta tono={u.activo ? 'verde' : 'rojo'}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={actualizarUsuario} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="id" value={u.id} />
                      <Seleccion
                        etiqueta="Rol"
                        nombre="rol_id"
                        valor={u.rol?.id}
                        opciones={opcionesRol}
                        requerido
                      />
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input
                          type="checkbox"
                          name="activo"
                          defaultChecked={u.activo}
                          className="size-4"
                        />
                        <span>Cuenta activa</span>
                      </label>
                    </FormularioDesplegable>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
