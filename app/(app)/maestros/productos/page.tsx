import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Buscador } from '@/components/buscador';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { agregarEmpaque, crearProducto, editarProducto } from './acciones';

export const metadata = { title: 'Productos · Inventario' };

interface Opcion {
  valor: string | number;
  texto: string;
}

interface Producto {
  id: number;
  codigo: string;
  descripcion_es: string | null;
  descripcion_zh: string | null;
  rango_tallas: string | null;
  marca: string | null;
  activo: boolean;
  categoria_id: number;
  unidad_medida_id: number;
}

const ESTADOS: Opcion[] = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

/**
 * Campos del artículo. Las unidades por caja no están aquí: solo se piden al
 * crear, porque después son un empaque nuevo y no una corrección.
 */
function CamposProducto({
  p,
  categorias,
  unidades,
}: {
  p?: Producto;
  categorias: Opcion[];
  unidades: Opcion[];
}) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Campo etiqueta="Código" nombre="codigo" valor={p?.codigo} requerido ejemplo="B7577E" />
      <Seleccion
        etiqueta="Categoría"
        nombre="categoria_id"
        valor={p?.categoria_id}
        opciones={categorias}
        requerido
      />
      <Campo
        etiqueta="Descripción"
        nombre="descripcion_es"
        valor={p?.descripcion_es}
        ancho="completo"
        ejemplo="Zapatilla escolar niño, negro"
      />
      <Seleccion
        etiqueta="Se cuenta en"
        nombre="unidad_medida_id"
        valor={p?.unidad_medida_id}
        opciones={unidades}
        requerido
      />
      <Campo
        etiqueta="Rango de tallas"
        nombre="rango_tallas"
        valor={p?.rango_tallas}
        ejemplo="30-35"
      />
      <Campo etiqueta="Marca" nombre="marca" valor={p?.marca} />
      <Campo
        etiqueta="Descripción en chino"
        nombre="descripcion_zh"
        valor={p?.descripcion_zh}
        ancho="completo"
        ejemplo="童鞋 黑色"
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={p ? (p.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
    </>
  );
}

/** MAE-01 y MAE-02: catálogo de artículos y sus empaques. */
export default async function Productos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const q = typeof crudos['q'] === 'string' ? crudos['q'] : undefined;
  const usuario = await requerirPermiso('producto.ver');
  const puedeCrear = usuario.permisos.has('producto.crear');
  const puedeEditar = usuario.permisos.has('producto.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(crudos);

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('producto')
    // La cadena del select debe ser un literal: los tipos de Supabase la
    // analizan estáticamente y una concatenación los deja en `unknown`.
    .select(
      'id, codigo, descripcion_es, descripcion_zh, rango_tallas, marca, activo, categoria_id, unidad_medida_id, categoria:categoria_id(nombre_es), unidad:unidad_medida_id(nombre_es), variantes:producto_variante(id, unidades_por_caja)',
      { count: 'exact' },
    )
    .order('codigo')
    .range(desde, hasta);

  if (q) consulta = consulta.ilike('codigo', `%${q}%`);

  const [{ data: productos, count, error }, { data: categorias }, { data: unidadesMedida }] =
    await Promise.all([
      consulta,
      supabase.from('categoria').select('id, nombre_es').eq('activo', true).order('codigo'),
      supabase.from('unidad_medida').select('id, nombre_es').eq('activo', true).order('codigo'),
    ]);

  if (error) return <Vacio>No se pudieron cargar los productos: {error.message}</Vacio>;

  const opcionesCategoria: Opcion[] = (categorias ?? []).map((c) => ({
    valor: c.id,
    texto: c.nombre_es,
  }));
  const opcionesUnidad: Opcion[] = (unidadesMedida ?? []).map((u) => ({
    valor: u.id,
    texto: u.nombre_es,
  }));
  const total = count ?? 0;

  return (
    <>
      <Encabezado
        titulo="Productos"
        descripcion={`Catálogo de artículos (MAE-01) · ${numero(total)} ${total === 1 ? 'artículo' : 'artículos'}`}
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
        {puedeCrear ? (
          <FormularioDesplegable accion={crearProducto} etiquetaNuevo="Nuevo artículo">
            <CamposProducto categorias={opcionesCategoria} unidades={opcionesUnidad} />
            <Campo
              etiqueta="Unidades que trae cada caja"
              nombre="unidades_por_caja"
              tipo="number"
              requerido
              ejemplo="45"
              minimo={0.01}
              ayuda="Debe ser mayor que cero"
            />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {productos.length === 0 ? (
        <Vacio>
          {q ? (
            <>
              Ningún artículo coincide con <strong>{q}</strong>.
            </>
          ) : (
            <>
              El catálogo está vacío. Se poblará al migrar <code>BODEGA.xls</code>.
            </>
          )}
        </Vacio>
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Artículo</Th>
                <Th>Categoría</Th>
                <Th>Tallas</Th>
                <Th numerico>Unidades por caja</Th>
                <Th>Se cuenta en</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <code className="text-xs">{p.codigo}</code>
                  </Td>
                  <Td>{p.descripcion_es ?? '—'}</Td>
                  <Td tenue>{p.categoria?.nombre_es ?? '—'}</Td>
                  <Td tenue>{p.rango_tallas ?? '—'}</Td>
                  <Td numerico>
                    {p.variantes.length === 0 ? (
                      <Etiqueta tono="ambar">sin definir</Etiqueta>
                    ) : (
                      [...p.variantes]
                        .sort((a, b) => a.unidades_por_caja - b.unidades_por_caja)
                        .map((v) => numero(v.unidades_por_caja))
                        .join(' · ')
                    )}
                  </Td>
                  <Td tenue>{p.unidad?.nombre_es ?? '—'}</Td>
                  <Td>
                    <Etiqueta tono={p.activo ? 'verde' : 'neutro'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Etiqueta>
                  </Td>
                  {puedeEditar ? (
                    <Td>
                      <div className="flex gap-3 whitespace-nowrap">
                        <FormularioDesplegable accion={editarProducto} etiquetaNuevo="" esEdicion>
                          <CamposProducto
                            p={p}
                            categorias={opcionesCategoria}
                            unidades={opcionesUnidad}
                          />
                        </FormularioDesplegable>
                        <FormularioDesplegable
                          accion={agregarEmpaque}
                          etiquetaNuevo="Agregar empaque"
                          esEdicion
                        >
                          <input type="hidden" name="producto_id" value={p.id} />
                          <p className="text-sm text-tenue sm:col-span-2">
                            Artículo <code className="text-xs">{p.codigo}</code>. Use esto solo
                            cuando el mismo artículo empiece a llegar en cajas de otra cantidad. La
                            cantidad de un empaque que ya tiene movimientos no se corrige.
                          </p>
                          <Campo
                            etiqueta="Unidades que trae cada caja"
                            nombre="unidades_por_caja"
                            tipo="number"
                            requerido
                            ejemplo="24"
                            ancho="completo"
                            minimo={0.01}
                            ayuda="Debe ser distinta de los empaques que el artículo ya tiene"
                          />
                        </FormularioDesplegable>
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}

      <Paginacion total={total} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
