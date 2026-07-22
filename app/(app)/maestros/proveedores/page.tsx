import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { guardarProveedor } from './acciones';

export const metadata = { title: 'Proveedores · Inventario' };

interface Proveedor {
  id: number;
  codigo: string;
  nombre: string;
  nombre_zh: string | null;
  pais: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
}

function Campos({ p }: { p?: Proveedor }) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Campo etiqueta="Código" nombre="codigo" valor={p?.codigo} requerido ejemplo="FUJIAN01" />
      <Campo etiqueta="Nombre" nombre="nombre" valor={p?.nombre} requerido />
      <Campo
        etiqueta="Nombre en chino"
        nombre="nombre_zh"
        valor={p?.nombre_zh}
        ejemplo="福建鞋厂"
      />
      <Campo etiqueta="País" nombre="pais" valor={p?.pais ?? 'CN'} requerido ejemplo="CN" />
      <Campo etiqueta="Contacto" nombre="contacto" valor={p?.contacto} />
      <Campo etiqueta="Correo" nombre="email" valor={p?.email} tipo="email" />
      <Campo etiqueta="Teléfono" nombre="telefono" valor={p?.telefono} />
      <Campo etiqueta="Dirección" nombre="direccion" valor={p?.direccion} ancho="completo" />
    </>
  );
}

/** MAE-05: proveedores (fábricas en China). */
export default async function Proveedores() {
  const usuario = await requerirPermiso('proveedor.ver');
  const puedeEditar = usuario.permisos.has('proveedor.editar');

  const supabase = await crearClienteServidor();
  const { data: proveedores, error } = await supabase
    .from('proveedor')
    .select('id, codigo, nombre, nombre_zh, pais, contacto, email, telefono, direccion, activo')
    .order('nombre');

  if (error) return <Vacio>No se pudieron cargar los proveedores: {error.message}</Vacio>;

  return (
    <>
      <Encabezado titulo="Proveedores" descripcion="Fábricas y proveedores de importación (MAE-05)">
        {puedeEditar ? (
          <FormularioDesplegable accion={guardarProveedor} etiquetaNuevo="Nuevo proveedor">
            <Campos />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {proveedores.length === 0 ? (
        <Vacio>
          No hay proveedores registrados.
          {puedeEditar ? ' Use «Nuevo proveedor» para agregar el primero.' : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nombre</Th>
              <Th>País</Th>
              <Th>Contacto</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id}>
                <Td>
                  <code className="text-xs">{p.codigo}</code>
                </Td>
                <Td>
                  {p.nombre}
                  {p.nombre_zh ? (
                    <span className="ml-2 text-xs text-zinc-500">{p.nombre_zh}</span>
                  ) : null}
                </Td>
                <Td tenue>{p.pais}</Td>
                <Td tenue>{p.contacto ?? p.email ?? p.telefono ?? '—'}</Td>
                <Td>
                  <Etiqueta tono={p.activo ? 'verde' : 'neutro'}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarProveedor} etiquetaNuevo="" esEdicion>
                      <Campos p={p} />
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
