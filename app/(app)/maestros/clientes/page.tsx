import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { guardarCliente } from './acciones';

export const metadata = { title: 'Clientes · Inventario' };

interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
  rut: string | null;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  pais: string;
  notas: string | null;
  activo: boolean;
}

function Campos({ c }: { c?: Cliente }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo etiqueta="Código" nombre="codigo" valor={c?.codigo} requerido ejemplo="CLI001" />
      <Campo etiqueta="Nombre" nombre="nombre" valor={c?.nombre} requerido />
      <Campo etiqueta="RUT" nombre="rut" valor={c?.rut} ejemplo="76.123.456-7" />
      <Campo etiqueta="País" nombre="pais" valor={c?.pais ?? 'CL'} requerido ejemplo="CL" />
      <Campo etiqueta="Ciudad" nombre="ciudad" valor={c?.ciudad} ejemplo="Iquique" />
      <Campo etiqueta="Contacto" nombre="contacto" valor={c?.contacto} />
      <Campo etiqueta="Correo" nombre="email" valor={c?.email} tipo="email" />
      <Campo etiqueta="Teléfono" nombre="telefono" valor={c?.telefono} />
      <Campo etiqueta="Dirección" nombre="direccion" valor={c?.direccion} ancho="completo" />
      <Campo etiqueta="Notas" nombre="notas" valor={c?.notas} ancho="completo" />
    </>
  );
}

/** MAE-06: clientes (compradores mayoristas de ZOFRI y resto de Chile). */
export default async function Clientes() {
  const usuario = await requerirPermiso('cliente.ver');
  const puedeEditar = usuario.permisos.has('cliente.editar');

  const supabase = await crearClienteServidor();
  const { data: clientes, error } = await supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, rut, contacto, email, telefono, direccion, ciudad, pais, notas, activo',
    )
    .order('nombre');

  if (error) return <Vacio>No se pudieron cargar los clientes: {error.message}</Vacio>;

  return (
    <>
      <Encabezado titulo="Clientes" descripcion="Compradores mayoristas (MAE-06)">
        {puedeEditar ? (
          <FormularioDesplegable accion={guardarCliente} etiquetaNuevo="Nuevo cliente">
            <Campos />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {clientes.length === 0 ? (
        <Vacio>
          No hay clientes registrados.
          {puedeEditar ? ' Use «Nuevo cliente» para agregar el primero.' : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nombre</Th>
              <Th>RUT</Th>
              <Th>Ciudad</Th>
              <Th>Contacto</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <Td>
                  <code className="text-xs">{c.codigo}</code>
                </Td>
                <Td>{c.nombre}</Td>
                <Td tenue>{c.rut ?? '—'}</Td>
                <Td tenue>{c.ciudad ? `${c.ciudad} (${c.pais})` : c.pais}</Td>
                <Td tenue>{c.contacto ?? c.email ?? c.telefono ?? '—'}</Td>
                <Td>
                  <Etiqueta tono={c.activo ? 'verde' : 'neutro'}>
                    {c.activo ? 'Activo' : 'Inactivo'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarCliente} etiquetaNuevo="" esEdicion>
                      <Campos c={c} />
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
