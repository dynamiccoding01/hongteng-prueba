import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { guardarUnidad } from './acciones';

export const metadata = { title: 'Unidades de medida · Inventario' };

interface Unidad {
  id: number;
  codigo: string;
  nombre_es: string;
  nombre_zh: string | null;
  activo: boolean;
}

const ESTADOS = [
  { valor: '1', texto: 'Activa' },
  { valor: '0', texto: 'Inactiva' },
];

function Campos({ u }: { u?: Unidad }) {
  return (
    <>
      {u ? <input type="hidden" name="id" value={u.id} /> : null}
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={u?.codigo}
        requerido
        ejemplo="PAR"
        largoMax={20}
        ayuda="Se guarda en mayúsculas y sin espacios"
      />
      <Campo
        etiqueta="Nombre"
        nombre="nombre_es"
        valor={u?.nombre_es}
        requerido
        ejemplo="Par"
        largoMax={60}
      />
      <Campo
        etiqueta="Nombre en chino"
        nombre="nombre_zh"
        valor={u?.nombre_zh}
        ejemplo="双"
        largoMax={60}
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={u ? (u.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
    </>
  );
}

/**
 * MAE-07: en qué se cuenta un artículo (par, pieza, juego).
 *
 * No confundir con las unidades por caja del producto: eso es cuántas trae
 * cada caja, y se define en el propio artículo.
 */
export default async function Unidades({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('unidad.ver');
  const puedeEditar = usuario.permisos.has('unidad.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();
  const {
    data: unidades,
    count,
    error,
  } = await supabase
    .from('unidad_medida')
    .select('id, codigo, nombre_es, nombre_zh, activo, productos:producto(id)', { count: 'exact' })
    .order('codigo')
    .range(desde, hasta);

  if (error) return <Vacio>No se pudieron cargar las unidades de medida: {error.message}</Vacio>;

  return (
    <>
      <Encabezado
        titulo="Unidades de medida"
        descripcion="En qué se cuenta cada artículo: par, pieza, juego"
      >
        {puedeEditar ? (
          <FormularioDesplegable accion={guardarUnidad} etiquetaNuevo="Nueva unidad">
            <Campos />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {unidades.length === 0 ? (
        <Vacio>No hay unidades de medida registradas.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nombre</Th>
              <Th>中文</Th>
              <Th numerico>Artículos que la usan</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.id}>
                <Td>
                  <code className="text-xs">{u.codigo}</code>
                </Td>
                <Td>{u.nombre_es}</Td>
                <Td tenue>{u.nombre_zh ?? '—'}</Td>
                <Td numerico tenue>
                  {u.productos.length}
                </Td>
                <Td>
                  <Etiqueta tono={u.activo ? 'verde' : 'neutro'}>
                    {u.activo ? 'Activa' : 'Inactiva'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarUnidad} etiquetaNuevo="" esEdicion>
                      <Campos u={u} />
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
