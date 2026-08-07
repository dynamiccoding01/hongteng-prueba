import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Tarjeta, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { actualizarUsuario, crearUsuario, restablecerContrasena } from './acciones';

export const metadata = { title: 'Usuarios · Inventario' };

const ESTADOS = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

function fecha(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** ADM-01: usuarios del sistema, su rol y su acceso. */
export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actual = await requerirPermiso('usuario.ver');
  const puedeCrear = actual.permisos.has('usuario.crear');
  const puedeEditar = actual.permisos.has('usuario.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [{ data: usuarios, count, error }, { data: roles }] = await Promise.all([
    supabase
      .from('usuario')
      .select('id, nombre, email, activo, ultimo_acceso, rol_id, rol:rol_id(id, nombre)', {
        count: 'exact',
      })
      .order('nombre')
      .range(desde, hasta),
    // Opciones del formulario: la lista completa de roles asignables.
    supabase.from('rol').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los usuarios: {error.message}</Vacio>;

  const opcionesRol = (roles ?? []).map((r) => ({ valor: r.id, texto: r.nombre }));

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion="Acceso al sistema y rol asignado (ADM-01)">
        {puedeCrear ? (
          <FormularioDesplegable accion={crearUsuario} etiquetaNuevo="Nuevo usuario">
            <Campo
              etiqueta="Nombre"
              nombre="nombre"
              requerido
              ejemplo="María Pérez"
              largoMax={80}
              autocompletado="off"
            />
            <Campo
              etiqueta="Correo"
              nombre="email"
              tipo="email"
              requerido
              ejemplo="maria@hongteng.cl"
              largoMax={120}
              autocompletado="off"
              ayuda="Con este correo inicia sesión"
            />
            <Seleccion etiqueta="Rol" nombre="rol_id" opciones={opcionesRol} requerido />
            <Campo
              etiqueta="Contraseña inicial"
              nombre="clave"
              tipo="password"
              requerido
              largoMax={72}
              autocompletado="new-password"
              ayuda="Mínimo 8 caracteres"
              patron=".{8,}"
            />
            <p className="text-sm text-tenue sm:col-span-2">
              Entréguele la contraseña a la persona: con ella entra de inmediato y después puede
              cambiarla.
            </p>
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

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
                    <div className="flex gap-3 whitespace-nowrap">
                      <FormularioDesplegable accion={actualizarUsuario} etiquetaNuevo="" esEdicion>
                        <input type="hidden" name="id" value={u.id} />
                        <Campo
                          etiqueta="Nombre"
                          nombre="nombre"
                          valor={u.nombre}
                          requerido
                          largoMax={80}
                        />
                        <Campo
                          etiqueta="Correo"
                          nombre="email"
                          tipo="email"
                          valor={u.email}
                          requerido
                          largoMax={120}
                          ayuda="Si lo cambia, cambia su acceso"
                        />
                        <Seleccion
                          etiqueta="Rol"
                          nombre="rol_id"
                          valor={u.rol_id}
                          opciones={opcionesRol}
                          requerido
                        />
                        <Seleccion
                          etiqueta="Estado"
                          nombre="activo"
                          valor={u.activo ? '1' : '0'}
                          opciones={ESTADOS}
                          requerido
                        />
                      </FormularioDesplegable>

                      <FormularioDesplegable
                        accion={restablecerContrasena}
                        etiquetaNuevo="Contraseña"
                        esEdicion
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <p className="text-sm text-tenue sm:col-span-2">
                          Contraseña nueva para <strong>{u.nombre}</strong> ({u.email}).
                        </p>
                        <Campo
                          etiqueta="Contraseña nueva"
                          nombre="clave"
                          tipo="password"
                          requerido
                          ancho="completo"
                          largoMax={72}
                          autocompletado="new-password"
                          ayuda="Mínimo 8 caracteres"
                          patron=".{8,}"
                        />
                      </FormularioDesplegable>
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />

      <Tarjeta className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Un usuario desactivado conserva su historial en la bitácora pero no puede entrar. Por eso
        las cuentas no se eliminan: se desactivan.
      </Tarjeta>
    </>
  );
}
