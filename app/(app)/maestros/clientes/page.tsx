import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { AreaTexto, Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
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

const ESTADOS = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

/** Campos del cliente: identificación, ubicación y por último cómo contactarlo. */
function Campos({ c }: { c?: Cliente }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={c?.codigo}
        requerido
        ejemplo="CLI001"
        largoMax={20}
        transformar="codigo"
        ayuda="Se guarda en mayúsculas y sin espacios"
      />
      <Campo etiqueta="Nombre" nombre="nombre" valor={c?.nombre} requerido largoMax={120} />
      <Campo
        etiqueta="RUT"
        nombre="rut"
        valor={c?.rut}
        ejemplo="76.123.456-7"
        largoMax={12}
        patron="[0-9]{1,3}(\.?[0-9]{3})*-[0-9kK]"
        transformar="codigo"
        ayuda="Con dígito verificador. Vacío si el cliente es extranjero"
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={c ? (c.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
      <Campo
        etiqueta="País"
        nombre="pais"
        valor={c?.pais ?? 'CL'}
        requerido
        ejemplo="CL"
        largoMax={3}
        patron="[A-Za-z]{2,3}"
        transformar="codigo"
        ayuda="Código de 2 o 3 letras: CL, PE, BO"
      />
      <Campo etiqueta="Ciudad" nombre="ciudad" valor={c?.ciudad} ejemplo="Iquique" largoMax={80} />
      <Campo etiqueta="Contacto" nombre="contacto" valor={c?.contacto} largoMax={80} />
      <Campo
        etiqueta="Correo"
        nombre="email"
        valor={c?.email}
        tipo="email"
        largoMax={120}
        ejemplo="compras@cliente.cl"
      />
      <Campo
        etiqueta="Teléfono"
        nombre="telefono"
        valor={c?.telefono}
        tipo="tel"
        largoMax={25}
        patron="[0-9+][0-9\s\-]{5,24}"
        ejemplo="+56 9 1234 5678"
        ayuda="Solo números, espacios y guiones"
      />
      <AreaTexto
        etiqueta="Dirección"
        nombre="direccion"
        valor={c?.direccion}
        largoMax={200}
        filas={2}
      />
      <AreaTexto etiqueta="Notas" nombre="notas" valor={c?.notas} largoMax={500} filas={3} />
    </>
  );
}

/** MAE-06: clientes (compradores mayoristas de ZOFRI y resto de Chile). */
export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('cliente.ver');
  const puedeEditar = usuario.permisos.has('cliente.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();
  const {
    data: clientes,
    count,
    error,
  } = await supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, rut, contacto, email, telefono, direccion, ciudad, pais, notas, activo',
      { count: 'exact' },
    )
    .order('nombre')
    .range(desde, hasta);

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

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
