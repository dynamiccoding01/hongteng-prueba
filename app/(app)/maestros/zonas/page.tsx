import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { guardarBodega, guardarZona } from './acciones';

export const metadata = { title: 'Bodegas y zonas · Inventario' };

/** MAE-04: bodegas y sus zonas de ubicación, normalizadas. */
export default async function Zonas() {
  const usuario = await requerirPermiso('zona.ver');
  const puedeEditar = usuario.permisos.has('zona.editar');

  const supabase = await crearClienteServidor();

  const [{ data: bodegas, error: errorBodegas }, { data: zonas, error: errorZonas }] =
    await Promise.all([
      supabase.from('bodega').select('id, codigo, nombre, direccion, activo').order('codigo'),
      supabase
        .from('zona')
        .select('id, codigo, descripcion, activo, bodega:bodega_id(id, codigo, nombre)')
        .order('codigo'),
    ]);

  const error = errorBodegas ?? errorZonas;
  if (error) return <Vacio>No se pudieron cargar los datos: {error.message}</Vacio>;

  const opcionesBodega = (bodegas ?? []).map((b) => ({
    valor: b.id,
    texto: `${b.codigo} — ${b.nombre}`,
  }));

  return (
    <>
      <Encabezado
        titulo="Bodegas y zonas"
        descripcion="Ubicaciones físicas de la mercadería (MAE-04)"
      />

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Bodegas</h2>
          {puedeEditar ? (
            <FormularioDesplegable accion={guardarBodega} etiquetaNuevo="Nueva bodega">
              <Campo etiqueta="Código" nombre="codigo" requerido ejemplo="IQQ" />
              <Campo etiqueta="Nombre" nombre="nombre" requerido ejemplo="Iquique — ZOFRI" />
              <Campo etiqueta="Dirección" nombre="direccion" ancho="completo" />
            </FormularioDesplegable>
          ) : null}
        </div>

        {(bodegas ?? []).length === 0 ? (
          <Vacio>No hay bodegas registradas.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Dirección</Th>
                <Th>Zonas</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {(bodegas ?? []).map((b) => (
                <tr key={b.id}>
                  <Td>
                    <code className="text-xs">{b.codigo}</code>
                  </Td>
                  <Td>{b.nombre}</Td>
                  <Td tenue>{b.direccion ?? '—'}</Td>
                  <Td numerico>{(zonas ?? []).filter((z) => z.bodega?.id === b.id).length}</Td>
                  <Td>
                    <Etiqueta tono={b.activo ? 'verde' : 'neutro'}>
                      {b.activo ? 'Activa' : 'Inactiva'}
                    </Etiqueta>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Zonas <span className="ml-1 text-xs text-zinc-500">区域</span>
          </h2>
          {puedeEditar && opcionesBodega.length > 0 ? (
            <FormularioDesplegable accion={guardarZona} etiquetaNuevo="Nueva zona">
              <Seleccion etiqueta="Bodega" nombre="bodega_id" opciones={opcionesBodega} requerido />
              <Campo etiqueta="Código" nombre="codigo" requerido ejemplo="1-4 · M2-4 · 3-8" />
              <Campo etiqueta="Descripción" nombre="descripcion" ancho="completo" />
            </FormularioDesplegable>
          ) : null}
        </div>

        {(zonas ?? []).length === 0 ? (
          <Vacio>
            No hay zonas registradas. Se crearán automáticamente al migrar <code>BODEGA.xls</code>,
            o puede agregarlas a mano.
          </Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Bodega</Th>
                <Th>Descripción</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {(zonas ?? []).map((z) => (
                <tr key={z.id}>
                  <Td>
                    <code className="text-xs">{z.codigo}</code>
                  </Td>
                  <Td tenue>{z.bodega?.codigo ?? '—'}</Td>
                  <Td tenue>{z.descripcion ?? '—'}</Td>
                  <Td>
                    <Etiqueta tono={z.activo ? 'verde' : 'neutro'}>
                      {z.activo ? 'Activa' : 'Inactiva'}
                    </Etiqueta>
                  </Td>
                  {puedeEditar ? (
                    <Td>
                      <FormularioDesplegable accion={guardarZona} etiquetaNuevo="" esEdicion>
                        <input type="hidden" name="id" value={z.id} />
                        <Seleccion
                          etiqueta="Bodega"
                          nombre="bodega_id"
                          valor={z.bodega?.id}
                          opciones={opcionesBodega}
                          requerido
                        />
                        <Campo etiqueta="Código" nombre="codigo" valor={z.codigo} requerido />
                        <Campo
                          etiqueta="Descripción"
                          nombre="descripcion"
                          valor={z.descripcion}
                          ancho="completo"
                        />
                      </FormularioDesplegable>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </>
  );
}
