import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Tarjeta, Td, Th, Vacio } from '@/components/ui';
import { FormularioDesplegable, Campo, Seleccion } from '@/components/formulario';
import { MatrizPermisos, type ModuloPermisos } from '@/components/matriz-permisos';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { crearRol, editarRol } from './acciones';

const ESTADOS = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

export const metadata = { title: 'Roles y permisos · Inventario' };

/**
 * ADM-01: administra la cadena usuario → rol → rol_permiso ← permiso.
 * La matriz es editable (marcar/desmarcar asigna o quita permisos) y se pueden
 * crear roles. RLS decide qué roles se ven: un Administrador no ve los roles
 * protegidos (Superadmin); un Superadmin los ve todos.
 */
export default async function Roles({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('rol.editar');
  const puedeEditar = usuario.permisos.has('rol.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [
    { data: roles, error },
    { data: permisos },
    { data: asignaciones },
    { data: paginados, count },
  ] = await Promise.all([
    // La matriz necesita todos los roles: son sus columnas, no un listado.
    supabase
      .from('rol')
      .select('id, nombre, descripcion, activo, acceso_total, protegido, descuento_maximo')
      .order('nombre'),
    supabase.from('permiso').select('id, codigo, modulo, descripcion').order('codigo'),
    supabase.from('rol_permiso').select('rol_id, permiso_id'),
    // La tabla de abajo sí es un listado y va paginada.
    supabase
      .from('rol')
      .select('id, nombre, descripcion, activo, acceso_total, protegido, descuento_maximo', {
        count: 'exact',
      })
      .order('nombre')
      .range(desde, hasta),
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
            <Campo etiqueta="Nombre" nombre="nombre" requerido ejemplo="Supervisor" largoMax={40} />
            <Campo
              etiqueta="Descripción"
              nombre="descripcion"
              ejemplo="Para qué sirve el rol"
              largoMax={200}
            />
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

      <h2 className="mt-8 mb-3 text-sm font-semibold">Roles</h2>

      <Tabla>
        <thead>
          <tr>
            <Th>Rol</Th>
            <Th>Descripción</Th>
            <Th numerico>Permisos</Th>
            <Th numerico>Descuento máx.</Th>
            <Th>Estado</Th>
            {puedeEditar ? <Th> </Th> : null}
          </tr>
        </thead>
        <tbody>
          {(paginados ?? []).map((r) => (
            <tr key={r.id}>
              <Td>{r.nombre}</Td>
              <Td tenue>{r.descripcion ?? '—'}</Td>
              <Td numerico tenue>
                {r.acceso_total ? (
                  <Etiqueta tono="ambar">acceso total</Etiqueta>
                ) : (
                  (conteo.get(r.id) ?? 0)
                )}
              </Td>
              {/* VEN-07: sin tope no es lo mismo que 0, y así se lee. */}
              <Td numerico tenue>
                {r.descuento_maximo === null ? 'sin tope' : `${Number(r.descuento_maximo)} %`}
              </Td>
              <Td>
                <Etiqueta tono={r.activo ? 'verde' : 'neutro'}>
                  {r.activo ? 'Activo' : 'Inactivo'}
                </Etiqueta>
              </Td>
              {puedeEditar ? (
                <Td>
                  {/* Los roles protegidos son del sistema: no se renombran. */}
                  {r.protegido ? (
                    <span className="text-xs text-tenue">del sistema</span>
                  ) : (
                    <FormularioDesplegable accion={editarRol} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="id" value={r.id} />
                      <Campo
                        etiqueta="Nombre"
                        nombre="nombre"
                        valor={r.nombre}
                        requerido
                        largoMax={40}
                      />
                      <Campo
                        etiqueta="Descripción"
                        nombre="descripcion"
                        valor={r.descripcion}
                        ejemplo="Para qué sirve el rol"
                        largoMax={200}
                      />
                      <Campo
                        etiqueta="Descuento máximo (%)"
                        nombre="descuento_maximo"
                        tipo="number"
                        valor={r.descuento_maximo}
                        minimo={0}
                        maximo={100}
                        ayuda="Cuánto puede rebajar este rol en cada línea de venta. Vacío = sin tope."
                      />
                      <Seleccion
                        etiqueta="Estado"
                        nombre="activo"
                        valor={r.activo ? '1' : '0'}
                        opciones={ESTADOS}
                        requerido
                      />
                    </FormularioDesplegable>
                  )}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Tabla>

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
