import { Fragment, Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { AreaTexto, Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { DistintivoBodega } from '@/components/color-bodega';
import { Buscador } from '@/components/buscador';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { nombreEnvase } from '@/lib/inventario/articulo';
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

/** Un empaque del artículo: la caja y todo lo que la identifica. */
interface Empaque {
  id: number;
  unidades_por_caja: number;
  codigo_barras: string | null;
  sku_interno: string | null;
  stock_minimo: number;
  activo: boolean;
}

const ESTADOS_EMPAQUE: Opcion[] = [
  { valor: '1', texto: 'Activo' },
  { valor: '0', texto: 'Inactivo' },
];

/**
 * Campos de un empaque, en un solo formulario.
 *
 * Es el único sitio donde se editan: cantidad, código de barras, SKU interno
 * y stock mínimo. El mínimo se consulta además en /inventario/alertas.
 *
 * `cantidadFija` es para los empaques que ya tienen kardex: su cantidad es el
 * factor con el que se convirtieron los movimientos ya aplicados, así que no se
 * ofrece el campo. La base lo rechaza igual (0019).
 */
function CamposEmpaque({
  e,
  cantidadFija,
  unidad,
}: {
  e?: Empaque;
  cantidadFija?: boolean;
  unidad: string;
}) {
  return (
    <>
      {cantidadFija ? null : (
        <Campo
          etiqueta="Cantidad unidades"
          nombre="unidades_por_caja"
          valor={e?.unidades_por_caja}
          tipo="number"
          requerido
          ejemplo="45"
          minimo={0.01}
          maximo={99999999}
          ayuda={`Cuántas unidades trae cada ${nombreEnvase(unidad)}`}
        />
      )}
      <Campo
        etiqueta="Stock mínimo"
        nombre="stock_minimo"
        valor={e?.stock_minimo ?? 0}
        tipo="number"
        minimo={0}
        maximo={99999999}
        ejemplo="5"
        ayuda="En cajas. 0 = sin alerta"
      />
      <Campo
        etiqueta="Código de barras"
        nombre="codigo_barras"
        valor={e?.codigo_barras}
        ejemplo="7801234567890"
        largoMax={40}
        patron="[0-9A-Za-z\-]+"
        transformar="codigo"
        ayuda="El impreso en la caja"
      />
      <Campo
        etiqueta="SKU interno"
        nombre="sku_interno"
        valor={e?.sku_interno}
        ejemplo="B7577E-48"
        largoMax={40}
        patron="[0-9A-Za-z\-]+"
        transformar="codigo"
        ayuda="Opcional, si imprimen etiqueta propia"
      />
      {e ? (
        <Seleccion
          etiqueta="Estado"
          nombre="activo"
          valor={e.activo ? '1' : '0'}
          opciones={ESTADOS_EMPAQUE}
          requerido
        />
      ) : null}
    </>
  );
}

/** Una fila de `stock`: existencia de un empaque en una zona concreta. */
interface Existencia {
  cantidad: number;
  totalUnidades: number;
  zona: string;
  bodega: string;
  bodegaNombre: string | null;
  color: string | null;
}

/**
 * Dónde está la existencia de UN empaque.
 *
 * La agrupación por empaque no es cosmética. Antes esta celda mezclaba las
 * ubicaciones de todos los empaques del artículo ordenadas por zona, y pasaba
 * lo de BT-4501: sus dos líneas del empaque de 8 (ARI AR-1 e IQQ ET-3) salían
 * separadas por la del empaque de 10, que también está en ARI AR-1. La misma
 * zona aparecía dos veces sin explicación —son cajas de distinto tamaño— y,
 * como la columna de al lado apilaba los empaques, el ojo leía una
 * correspondencia fila a fila que no existía.
 *
 * Al quedar cada empaque en su propia fila, la suma de cajas vuelve a tener
 * sentido: aquí todas las cajas traen lo mismo. Es lo que antes obligaba a
 * mostrar solo unidades.
 */
function CeldaStockEmpaque({ filas }: { filas: Existencia[] }) {
  if (filas.length === 0) return <span className="text-xs text-tenue">sin stock</span>;

  const cajas = filas.reduce((s, f) => s + f.cantidad, 0);
  const unidades = filas.reduce((s, f) => s + f.totalUnidades, 0);

  return (
    <div className="flex flex-col gap-1">
      {filas.map((f, i) => (
        <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
          <DistintivoBodega codigo={f.bodega} color={f.color} titulo={f.bodegaNombre} />
          <code className="text-xs">{f.zona}</code>
          <span className="tabular-nums">{numero(f.cantidad)}</span>
        </span>
      ))}
      <span
        className={`text-xs text-tenue tabular-nums ${
          filas.length > 1 ? 'border-t border-borde/60 pt-1' : ''
        }`}
      >
        {filas.length > 1 ? `${numero(cajas)} cajas · ` : ''}
        {numero(unidades)} unidades
      </span>
    </div>
  );
}

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
        etiqueta="Se cuenta por"
        nombre="unidad_medida_id"
        valor={p?.unidad_medida_id}
        opciones={unidades}
        requerido
        ayuda="La caja, docena o par en que llega, se guarda y se vende. Dentro van las unidades"
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
      'id, codigo, descripcion_es, descripcion_zh, rango_tallas, marca, activo, categoria_id, unidad_medida_id, proveedor_id, categoria:categoria_id(nombre_es), unidad:unidad_medida_id(nombre_es), proveedor:proveedor_id(nombre), variantes:producto_variante(id, unidades_por_caja, codigo_barras, sku_interno, stock_minimo, activo)',
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

  // Dos consultas más, ambas acotadas a los empaques de ESTA página: no son
  // listados, son el detalle de las filas que ya se están mostrando.
  const idsVariante = productos.flatMap((p) => p.variantes.map((v) => v.id));

  const conMovimientos = new Set<number>();
  const existenciasPorVariante = new Map<number, Existencia[]>();

  if (idsVariante.length > 0) {
    const [{ data: conteos }, { data: existencias }] = await Promise.all([
      // Qué empaques ya tienen kardex: su cantidad por caja queda sellada
      // (0019). Se cuenta en la base, no trayendo los movimientos.
      supabase
        .from('producto_variante')
        .select('id, movimientos:movimiento(count)')
        .in('id', idsVariante),
      // Dónde está la existencia. Una fila por empaque × zona, que es como
      // `stock` guarda las cosas. Se agrupa por empaque, no por artículo.
      supabase
        .from('stock')
        .select(
          'variante_id, cantidad, total_unidades, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color))',
        )
        .in('variante_id', idsVariante)
        .gt('cantidad', 0)
        .order('zona_id'),
    ]);

    for (const v of conteos ?? []) {
      if ((v.movimientos[0]?.count ?? 0) > 0) conMovimientos.add(v.id);
    }

    for (const s of existencias ?? []) {
      const lista = existenciasPorVariante.get(s.variante_id) ?? [];
      lista.push({
        cantidad: Number(s.cantidad),
        totalUnidades: Number(s.total_unidades),
        zona: s.zona.codigo,
        bodega: s.zona.bodega?.codigo ?? '—',
        bodegaNombre: s.zona.bodega?.nombre ?? null,
        color: s.zona.bodega?.color ?? null,
      });
      existenciasPorVariante.set(s.variante_id, lista);
    }

    // Dentro de cada empaque, por bodega y luego por zona: así las ubicaciones
    // de una misma bodega quedan juntas y su color forma un bloque.
    for (const lista of existenciasPorVariante.values()) {
      lista.sort((a, b) => a.bodega.localeCompare(b.bodega) || a.zona.localeCompare(b.zona));
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
                <Th>Se cuenta por</Th>
                {/* Las dos columnas del empaque van juntas y a la derecha de
                    las del artículo: cada fila es un empaque, y su existencia
                    es la de esa fila, no la del artículo entero. */}
                <Th numerico>Cantidad unidades</Th>
                <Th>Stock por ubicación</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                // Un artículo ocupa tantas filas como empaques tenga. Las
                // columnas que son del artículo —código, categoría, estado…—
                // se declaran una sola vez y las abarcan todas con `rowSpan`:
                // así es la propia tabla la que garantiza que cada existencia
                // quede en la fila de su empaque, y no el ojo del que mira.
                const empaques = [...p.variantes].sort(
                  (a, b) => a.unidades_por_caja - b.unidades_por_caja,
                );
                const filas = Math.max(empaques.length, 1);
                const unidadesArticulo = empaques.reduce(
                  (s, v) =>
                    s +
                    (existenciasPorVariante.get(v.id) ?? []).reduce(
                      (t, e) => t + e.totalUnidades,
                      0,
                    ),
                  0,
                );

                const celdasArticulo = (
                  <>
                    <Td filas={filas}>
                      <code className="text-xs">{p.codigo}</code>
                    </Td>
                    <Td filas={filas}>
                      {p.descripcion_es ?? '—'}
                      {/* El total del artículo solo aparece cuando hay varios
                          empaques: con uno solo repetiría el de su fila. Va en
                          unidades porque es lo único comparable entre cajas de
                          distinto contenido. */}
                      {empaques.length > 1 ? (
                        <span className="mt-1 block text-xs text-tenue">
                          {empaques.length} empaques · {numero(unidadesArticulo)} unidades en total
                        </span>
                      ) : null}
                    </Td>
                    <Td filas={filas} tenue>
                      {p.categoria?.nombre_es ?? '—'}
                    </Td>
                    <Td filas={filas} tenue>
                      {p.proveedor?.nombre ?? '—'}
                    </Td>
                    <Td filas={filas} tenue>
                      {p.rango_tallas ?? '—'}
                    </Td>
                    <Td filas={filas} tenue>
                      {p.unidad?.nombre_es ?? '—'}
                    </Td>
                  </>
                );

                const celdasAcciones = (
                  <>
                    <Td filas={filas}>
                      <Etiqueta tono={p.activo ? 'verde' : 'neutro'}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Etiqueta>
                    </Td>
                    {puedeEditar ? (
                      <Td filas={filas}>
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
                            etiquetaNuevo="Agregar cantidad"
                            esEdicion
                          >
                            <input type="hidden" name="producto_id" value={p.id} />
                            <p className="text-sm text-tenue sm:col-span-2">
                              Artículo <code className="text-xs">{p.codigo}</code>. Úselo cuando el
                              mismo artículo empiece a llegar en cajas de otra cantidad: se agrega
                              junto a las que ya tiene, no las reemplaza.
                              {empaques.length > 0
                                ? ` Ya existe con ${empaques
                                    .map((v) => numero(v.unidades_por_caja))
                                    .join(', ')}.`
                                : ''}
                            </p>
                            <CamposEmpaque unidad={p.unidad?.nombre_es ?? 'unidades'} />
                          </FormularioDesplegable>
                        </div>
                      </Td>
                    ) : null}
                  </>
                );

                return (
                  <Fragment key={p.id}>
                    {empaques.length === 0 ? (
                      <tr>
                        {celdasArticulo}
                        <Td numerico>
                          <Etiqueta tono="ambar">sin definir</Etiqueta>
                        </Td>
                        <Td>
                          <span className="text-xs text-tenue">sin stock</span>
                        </Td>
                        {celdasAcciones}
                      </tr>
                    ) : (
                      empaques.map((v, i) => {
                        // Entre empaques del mismo artículo el divisor es más
                        // suave; el fuerte queda para el corte entre artículos.
                        const intermedia = i < filas - 1;
                        return (
                          <tr key={v.id}>
                            {i === 0 ? celdasArticulo : null}
                            <Td numerico bordeTenue={intermedia}>
                              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                <span
                                  className={v.activo ? 'font-medium' : 'text-tenue line-through'}
                                >
                                  {numero(v.unidades_por_caja)}
                                </span>
                                {v.activo ? null : <Etiqueta tono="neutro">inactivo</Etiqueta>}
                                {puedeEditar ? (
                                  <FormularioDesplegable
                                    accion={editarEmpaque}
                                    etiquetaNuevo=""
                                    esEdicion
                                  >
                                    <input type="hidden" name="variante_id" value={v.id} />
                                    <p className="text-sm text-tenue sm:col-span-2">
                                      Artículo <code className="text-xs">{p.codigo}</code>, que se
                                      cuenta en <strong>{p.unidad?.nombre_es ?? '—'}</strong>.{' '}
                                      {conMovimientos.has(v.id)
                                        ? `La cantidad (${numero(v.unidades_por_caja)}) ya no se puede cambiar: tiene movimientos y es el factor con el que se convirtieron. Para otra cantidad, agregue un empaque nuevo.`
                                        : 'Todavía no tiene movimientos, así que su cantidad se puede corregir.'}
                                    </p>
                                    <CamposEmpaque
                                      e={v}
                                      cantidadFija={conMovimientos.has(v.id)}
                                      unidad={p.unidad?.nombre_es ?? 'unidades'}
                                    />
                                  </FormularioDesplegable>
                                ) : null}
                              </span>
                            </Td>
                            <Td bordeTenue={intermedia}>
                              <CeldaStockEmpaque filas={existenciasPorVariante.get(v.id) ?? []} />
                            </Td>
                            {i === 0 ? celdasAcciones : null}
                          </tr>
                        );
                      })
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Tabla>
        </>
      )}

      <Paginacion total={total} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
