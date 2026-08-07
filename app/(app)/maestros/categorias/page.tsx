import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { guardarCategoria } from './acciones';

export const metadata = { title: 'Categorías · Inventario' };

interface Categoria {
  id: number;
  codigo: string;
  nombre_es: string;
  nombre_zh: string | null;
  unidad_medida_default_id: number;
}

interface Opcion {
  valor: string | number;
  texto: string;
}

function Campos({ c, unidades }: { c?: Categoria; unidades: Opcion[] }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={c?.codigo}
        requerido
        ejemplo="NINO"
        largoMax={20}
        patron="[A-Z0-9_]+"
        ayuda="Solo mayúsculas, números y guion bajo"
      />
      <Campo
        etiqueta="Nombre"
        nombre="nombre_es"
        valor={c?.nombre_es}
        requerido
        ejemplo="Niño"
        largoMax={60}
      />
      <Campo
        etiqueta="Nombre en chino"
        nombre="nombre_zh"
        valor={c?.nombre_zh}
        ejemplo="童鞋"
        largoMax={60}
      />
      <Seleccion
        etiqueta="Se cuenta en"
        nombre="unidad_medida_default_id"
        valor={c?.unidad_medida_default_id}
        opciones={unidades}
        requerido
      />
    </>
  );
}

/** MAE-03: maestro de categorías (niño, juvenil, adulto, ropa), ampliable. */
export default async function Categorias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('categoria.ver');
  const puedeEditar = usuario.permisos.has('categoria.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();
  const [{ data: categorias, count, error }, { data: unidadesMedida }] = await Promise.all([
    supabase
      .from('categoria')
      .select(
        'id, codigo, nombre_es, nombre_zh, unidad_medida_default_id, activo, unidad:unidad_medida_default_id(nombre_es)',
        { count: 'exact' },
      )
      .order('codigo')
      .range(desde, hasta),
    supabase.from('unidad_medida').select('id, nombre_es').eq('activo', true).order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar las categorías: {error.message}</Vacio>;

  const opcionesUnidad: Opcion[] = (unidadesMedida ?? []).map((u) => ({
    valor: u.id,
    texto: u.nombre_es,
  }));

  return (
    <>
      <Encabezado titulo="Categorías" descripcion="Agrupación de productos del catálogo (MAE-03)">
        {puedeEditar ? (
          <FormularioDesplegable accion={guardarCategoria} etiquetaNuevo="Nueva categoría">
            <Campos unidades={opcionesUnidad} />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {categorias.length === 0 ? (
        <Vacio>No hay categorías registradas.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nombre</Th>
              <Th>中文</Th>
              <Th>Se cuenta en</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id}>
                <Td>
                  <code className="text-xs">{c.codigo}</code>
                </Td>
                <Td>{c.nombre_es}</Td>
                <Td tenue>{c.nombre_zh ?? '—'}</Td>
                <Td tenue>{c.unidad?.nombre_es ?? '—'}</Td>
                <Td>
                  <Etiqueta tono={c.activo ? 'verde' : 'neutro'}>
                    {c.activo ? 'Activa' : 'Inactiva'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarCategoria} etiquetaNuevo="" esEdicion>
                      <Campos c={c} unidades={opcionesUnidad} />
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
