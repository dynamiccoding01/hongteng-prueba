import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { Buscador } from '@/components/buscador';
import { agregarVariante, guardarProducto } from './acciones';

export const metadata = { title: 'Productos · Inventario' };

const POR_PAGINA = 50;

/** MAE-01 y MAE-02: catálogo de artículos y sus empaques. */
export default async function Productos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina } = await searchParams;
  const usuario = await requerirPermiso('producto.ver');
  const puedeCrear = usuario.permisos.has('producto.crear');
  const puedeEditar = usuario.permisos.has('producto.editar');

  const nPagina = Math.max(1, Number(pagina ?? 1));
  const desde = (nPagina - 1) * POR_PAGINA;

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('producto')
    // La cadena del select debe ser un literal: los tipos de Supabase la
    // analizan estáticamente y una concatenación los deja en `unknown`.
    .select(
      'id, codigo, descripcion_es, descripcion_zh, rango_tallas, unidad_medida, marca, activo, categoria:categoria_id(codigo, nombre_es), variantes:producto_variante(id, unidades_por_caja)',
      { count: 'exact' },
    )
    .order('codigo')
    .range(desde, desde + POR_PAGINA - 1);

  if (q) consulta = consulta.ilike('codigo', `%${q}%`);

  const [{ data: productos, count, error }, { data: categorias }] = await Promise.all([
    consulta,
    supabase.from('categoria').select('id, codigo, nombre_es').eq('activo', true).order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los productos: {error.message}</Vacio>;

  const opcionesCategoria = (categorias ?? []).map((c) => ({
    valor: c.id,
    texto: `${c.codigo} — ${c.nombre_es}`,
  }));
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

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
          <FormularioDesplegable accion={guardarProducto} etiquetaNuevo="Nuevo producto">
            <Campo etiqueta="Código (货号)" nombre="codigo" requerido ejemplo="B7577E" />
            <Seleccion
              etiqueta="Categoría"
              nombre="categoria_id"
              opciones={opcionesCategoria}
              requerido
            />
            <Campo etiqueta="Rango de tallas (码段)" nombre="rango_tallas" ejemplo="30-35" />
            <Campo
              etiqueta="Unidades por caja (双数)"
              nombre="unidades_por_caja"
              tipo="number"
              requerido
              ejemplo="48"
            />
            <Seleccion
              etiqueta="Unidad de medida"
              nombre="unidad_medida"
              valor="PAR"
              opciones={[
                { valor: 'PAR', texto: 'Par — calzado' },
                { valor: 'PIEZA', texto: 'Pieza — ropa' },
                { valor: 'JUEGO', texto: 'Juego' },
              ]}
              requerido
            />
            <Campo etiqueta="Marca" nombre="marca" />
            <Campo etiqueta="Descripción" nombre="descripcion_es" ancho="completo" />
            <Campo etiqueta="Descripción en chino" nombre="descripcion_zh" ancho="completo" />
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
                <Th>Categoría</Th>
                <Th>Tallas</Th>
                <Th>Empaques</Th>
                <Th>Unidad</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <code className="text-xs">{p.codigo}</code>
                    {p.descripcion_es ? (
                      <span className="ml-2 text-xs text-zinc-500">{p.descripcion_es}</span>
                    ) : null}
                  </Td>
                  <Td tenue>{p.categoria?.nombre_es ?? '—'}</Td>
                  <Td tenue>{p.rango_tallas ?? '—'}</Td>
                  <Td>
                    {p.variantes.length === 0 ? (
                      <Etiqueta tono="ambar">sin empaque</Etiqueta>
                    ) : (
                      <span className="text-xs">
                        {p.variantes
                          .map((v) => numero(v.unidades_por_caja))
                          .sort()
                          .join(' · ')}
                      </span>
                    )}
                  </Td>
                  <Td tenue>{p.unidad_medida}</Td>
                  <Td>
                    <Etiqueta tono={p.activo ? 'verde' : 'neutro'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Etiqueta>
                  </Td>
                  {puedeEditar ? (
                    <Td>
                      <FormularioDesplegable accion={agregarVariante} etiquetaNuevo="" esEdicion>
                        <input type="hidden" name="producto_id" value={p.id} />
                        <Campo
                          etiqueta="Nuevo empaque (unidades por caja)"
                          nombre="unidades_por_caja"
                          tipo="number"
                          requerido
                          ejemplo="24"
                          ancho="completo"
                        />
                      </FormularioDesplegable>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>

          {paginas > 1 ? (
            <p className="mt-4 text-sm text-zinc-500">
              Página {nPagina} de {numero(paginas)} · {numero(total)} artículos
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
