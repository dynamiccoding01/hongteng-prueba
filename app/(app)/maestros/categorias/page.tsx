import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { guardarCategoria } from './acciones';

export const metadata = { title: 'Categorías · Inventario' };

interface Categoria {
  id: number;
  codigo: string;
  nombre_es: string;
  nombre_zh: string | null;
  unidad_medida_default: string;
}

const UNIDADES = [
  { valor: 'PAR', texto: 'Par (双数) — calzado' },
  { valor: 'PIEZA', texto: 'Pieza (件数) — ropa' },
  { valor: 'JUEGO', texto: 'Juego' },
];

function Campos({ c }: { c?: Categoria }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo etiqueta="Código" nombre="codigo" valor={c?.codigo} requerido ejemplo="NINO" />
      <Campo etiqueta="Nombre" nombre="nombre_es" valor={c?.nombre_es} requerido ejemplo="Niño" />
      <Campo etiqueta="Nombre en chino" nombre="nombre_zh" valor={c?.nombre_zh} ejemplo="童鞋" />
      <Seleccion
        etiqueta="Unidad de medida"
        nombre="unidad_medida_default"
        valor={c?.unidad_medida_default ?? 'PAR'}
        opciones={UNIDADES}
        requerido
      />
    </>
  );
}

/** MAE-03: maestro de categorías (niño, juvenil, adulto, ropa), ampliable. */
export default async function Categorias() {
  const usuario = await requerirPermiso('categoria.ver');
  const puedeEditar = usuario.permisos.has('categoria.editar');

  const supabase = await crearClienteServidor();
  const { data: categorias, error } = await supabase
    .from('categoria')
    .select('id, codigo, nombre_es, nombre_zh, unidad_medida_default, activo')
    .order('codigo');

  if (error) return <Vacio>No se pudieron cargar las categorías: {error.message}</Vacio>;

  return (
    <>
      <Encabezado titulo="Categorías" descripcion="Agrupación de productos del catálogo (MAE-03)">
        {puedeEditar ? (
          <FormularioDesplegable accion={guardarCategoria} etiquetaNuevo="Nueva categoría">
            <Campos />
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
              <Th>Unidad</Th>
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
                <Td tenue>{c.unidad_medida_default}</Td>
                <Td>
                  <Etiqueta tono={c.activo ? 'verde' : 'neutro'}>
                    {c.activo ? 'Activa' : 'Inactiva'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarCategoria} etiquetaNuevo="" esEdicion>
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
