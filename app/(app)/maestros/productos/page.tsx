import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { AreaTexto, Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Buscador } from '@/components/buscador';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { agregarEmpaque, crearProducto, editarEmpaque, editarProducto } from './acciones';

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
  proveedor_id: number | null;
}

const ESTADOS: Opcion[] = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

/**
 * Campos del artículo, agrupados: primero qué es, después cómo se cuenta,
 * después de dónde viene y por último las descripciones.
 *
 * Las unidades por caja solo aparecen al crear (`alta`): después son un empaque
 * nuevo y no una corrección, y van junto a «Se cuenta en» porque es ahí donde
 * se confunden. Una dice en qué se cuenta el artículo (par); la otra, cuántos
 * de esos vienen en cada caja (45).
 */
function CamposProducto({
  p,
  categorias,
  unidades,
  proveedores,
  alta,
}: {
  p?: Producto;
  categorias: Opcion[];
  unidades: Opcion[];
  proveedores: Opcion[];
  alta?: boolean;
}) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={p?.codigo}
        requerido
        ejemplo="B7577E"
        largoMax={40}
        ayuda="El código de fábrica (货号)"
      />
      <Seleccion
        etiqueta="Categoría"
        nombre="categoria_id"
        valor={p?.categoria_id}
        opciones={categorias}
        requerido
      />
      <Seleccion
        etiqueta="Se cuenta en"
        nombre="unidad_medida_id"
        valor={p?.unidad_medida_id}
        opciones={unidades}
        requerido
      />
      {alta ? (
        <Campo
          etiqueta="Cantidad unidades"
          nombre="unidades_por_caja"
          tipo="number"
          requerido
          ejemplo="45"
          minimo={0.01}
          maximo={99999999}
          ayuda="Cuántas trae cada caja, en la unidad elegida arriba"
        />
      ) : null}
      <Campo
        etiqueta="Rango de tallas"
        nombre="rango_tallas"
        valor={p?.rango_tallas}
        ejemplo="30-35"
        largoMax={40}
      />
      <Campo etiqueta="Marca" nombre="marca" valor={p?.marca} largoMax={60} />
      <Seleccion
        etiqueta="Proveedor"
        nombre="proveedor_id"
        valor={p?.proveedor_id}
        opciones={proveedores}
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={p ? (p.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
      <AreaTexto
        etiqueta="Descripción"
        nombre="descripcion_es"
        valor={p?.descripcion_es}
        ejemplo="Zapatilla escolar niño, negro"
        largoMax={200}
        filas={2}
      />
      <AreaTexto
        etiqueta="Descripción en chino"
        nombre="descripcion_zh"
        valor={p?.descripcion_zh}
        ejemplo="童鞋 黑色"
        largoMax={200}
        filas={2}
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
      'id, codigo, descripcion_es, descripcion_zh, rango_tallas, marca, activo, categoria_id, unidad_medida_id, proveedor_id, categoria:categoria_id(nombre_es), unidad:unidad_medida_id(nombre_es), proveedor:proveedor_id(nombre), variantes:producto_variante(id, unidades_por_caja)',
      { count: 'exact' },
    )
    .order('codigo')
    .range(desde, hasta);

  if (q) consulta = consulta.ilike('codigo', `%${q}%`);

  // Las tres consultas de opciones van completas y sin paginar: son listas para
  // elegir en el formulario, no listados.
  const [
    { data: productos, count, error },
    { data: categorias },
    { data: unidadesMedida },
    { data: proveedores },
  ] = await Promise.all([
    consulta,
    supabase.from('categoria').select('id, nombre_es').eq('activo', true).order('codigo'),
    supabase.from('unidad_medida').select('id, nombre_es').eq('activo', true).order('codigo'),
    supabase.from('proveedor').select('id, codigo, nombre').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los productos: {error.message}</Vacio>;

  // Qué empaques de esta página ya tienen kardex. La cantidad por caja solo se
  // corrige mientras no lo tengan (0019): con movimientos aplicados, cambiar el
  // factor descuadraría el stock. Se cuenta en la base, no trayendo los
  // movimientos.
  const idsVariante = productos.flatMap((p) => p.variantes.map((v) => v.id));
  const conMovimientos = new Set<number>();
  if (idsVariante.length > 0) {
    const { data: conteos } = await supabase
      .from('producto_variante')
      .select('id, movimientos:movimiento(count)')
      .in('id', idsVariante);
    for (const v of conteos ?? []) {
      if ((v.movimientos[0]?.count ?? 0) > 0) conMovimientos.add(v.id);
    }
  }

  const opcionesCategoria: Opcion[] = (categorias ?? []).map((c) => ({
    valor: c.id,
    texto: c.nombre_es,
  }));
  const opcionesUnidad: Opcion[] = (unidadesMedida ?? []).map((u) => ({
    valor: u.id,
    texto: u.nombre_es,
  }));
  const opcionesProveedor: Opcion[] = (proveedores ?? []).map((p) => ({
    valor: p.id,
    texto: `${p.codigo} — ${p.nombre}`,
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
            <CamposProducto
              categorias={opcionesCategoria}
              unidades={opcionesUnidad}
              proveedores={opcionesProveedor}
              alta
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
                <Th>Proveedor</Th>
                <Th>Tallas</Th>
                <Th numerico>Cantidad unidades</Th>
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
                  <Td tenue>{p.proveedor?.nombre ?? '—'}</Td>
                  <Td tenue>{p.rango_tallas ?? '—'}</Td>
                  <Td numerico>
                    {p.variantes.length === 0 ? (
                      <Etiqueta tono="ambar">sin definir</Etiqueta>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {[...p.variantes]
                          .sort((a, b) => a.unidades_por_caja - b.unidades_por_caja)
                          .map((v) => (
                            <span
                              key={v.id}
                              className="inline-flex items-center gap-2 whitespace-nowrap"
                            >
                              {numero(v.unidades_por_caja)}
                              {puedeEditar ? (
                                conMovimientos.has(v.id) ? (
                                  // Con kardex el dato queda sellado: se dice por
                                  // qué, en vez de ofrecer un botón que va a fallar.
                                  <span
                                    className="text-xs text-tenue"
                                    title="Este empaque ya tiene movimientos: su cantidad no se puede cambiar. Use «Agregar empaque»."
                                  >
                                    con movimientos
                                  </span>
                                ) : (
                                  <FormularioDesplegable
                                    accion={editarEmpaque}
                                    etiquetaNuevo=""
                                    esEdicion
                                  >
                                    <input type="hidden" name="variante_id" value={v.id} />
                                    <p className="text-sm text-tenue sm:col-span-2">
                                      Artículo <code className="text-xs">{p.codigo}</code>, que se
                                      cuenta en <strong>{p.unidad?.nombre_es ?? '—'}</strong>. Este
                                      empaque todavía no tiene movimientos, así que su cantidad se
                                      puede corregir.
                                    </p>
                                    <Campo
                                      etiqueta="Cantidad unidades"
                                      nombre="unidades_por_caja"
                                      valor={v.unidades_por_caja}
                                      tipo="number"
                                      requerido
                                      ancho="completo"
                                      minimo={0.01}
                                      maximo={99999999}
                                      ayuda="Cuántas trae cada caja"
                                    />
                                  </FormularioDesplegable>
                                )
                              ) : null}
                            </span>
                          ))}
                      </div>
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
                            proveedores={opcionesProveedor}
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
                            etiqueta="Cantidad unidades"
                            nombre="unidades_por_caja"
                            tipo="number"
                            requerido
                            ejemplo="24"
                            ancho="completo"
                            minimo={0.01}
                            maximo={99999999}
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
