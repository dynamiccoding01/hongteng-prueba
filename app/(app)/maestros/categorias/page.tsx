import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { FormularioCategoria } from './formulario';

export const metadata = { title: 'Categorías · Inventario' };

/** MAE-03: maestro de categorías (niño, juvenil, adulto, ropa), ampliable. */
export default async function Categorias() {
  const usuario = await requerirPermiso('categoria.ver');
  const puedeEditar = usuario.permisos.has('categoria.editar');

  const supabase = await crearClienteServidor();
  const { data: categorias, error } = await supabase
    .from('categoria')
    .select('id, codigo, nombre_es, nombre_zh, unidad_medida_default, activo')
    .order('codigo');

  if (error) {
    return <Vacio>No se pudieron cargar las categorías: {error.message}</Vacio>;
  }

  return (
    <>
      <Encabezado titulo="Categorías" descripcion="Agrupación de productos del catálogo (MAE-03)">
        {puedeEditar ? <FormularioCategoria /> : null}
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
                    <FormularioCategoria
                      categoria={{
                        id: c.id,
                        codigo: c.codigo,
                        nombre_es: c.nombre_es,
                        nombre_zh: c.nombre_zh,
                        unidad_medida_default: c.unidad_medida_default,
                      }}
                    />
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
