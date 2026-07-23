import { Suspense } from 'react';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { Buscador } from '@/components/buscador';
import { actualizarCodigos } from './acciones';

export const metadata = { title: 'Códigos de barras · Inventario' };

/** INV-08: código de barras / SKU interno por empaque, para lectura rápida. */
export default async function Codigos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const usuario = await requerirPermiso('producto.ver');
  const puedeEditar = usuario.permisos.has('producto.editar');

  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('producto_variante')
    .select(
      'id, unidades_por_caja, codigo_barras, sku_interno, producto:producto_id!inner(codigo, activo)',
    )
    .eq('activo', true)
    .eq('producto.activo', true)
    .order('id')
    .limit(500);

  if (q) consulta = consulta.ilike('producto.codigo', `%${q}%`);

  const { data: variantes, error } = await consulta;

  if (error) return <Vacio>No se pudieron cargar los empaques: {error.message}</Vacio>;

  const ordenadas = (variantes ?? []).sort((a, b) =>
    a.producto.codigo.localeCompare(b.producto.codigo),
  );
  const sinCodigo = ordenadas.filter((v) => !v.codigo_barras && !v.sku_interno).length;

  return (
    <>
      <Encabezado
        titulo="Códigos de barras"
        descripcion={`Código de barras y SKU por empaque (INV-08) · ${numero(sinCodigo)} sin asignar`}
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
      </Encabezado>

      {ordenadas.length === 0 ? (
        <Vacio>
          {q ? (
            <>
              Ningún empaque coincide con <strong>{q}</strong>.
            </>
          ) : (
            <>Todavía no hay empaques registrados.</>
          )}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Artículo</Th>
              <Th numerico>Por caja</Th>
              <Th>Código de barras</Th>
              <Th>SKU interno</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((v) => (
              <tr key={v.id}>
                <Td>
                  <code className="text-xs">{v.producto.codigo}</code>
                </Td>
                <Td numerico tenue>
                  {numero(v.unidades_por_caja)}
                </Td>
                <Td tenue>{v.codigo_barras ?? <Etiqueta tono="ambar">sin asignar</Etiqueta>}</Td>
                <Td tenue>{v.sku_interno ?? '—'}</Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={actualizarCodigos} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="variante_id" value={v.id} />
                      <Campo
                        etiqueta="Código de barras"
                        nombre="codigo_barras"
                        valor={v.codigo_barras}
                        ejemplo="7801234567890"
                      />
                      <Campo
                        etiqueta="SKU interno"
                        nombre="sku_interno"
                        valor={v.sku_interno}
                        ejemplo="B7577E-48"
                      />
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
