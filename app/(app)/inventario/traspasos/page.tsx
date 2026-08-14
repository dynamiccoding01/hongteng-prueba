import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { FormularioDesplegable } from '@/components/formulario';
import { CamposTraspaso } from '@/components/campos-inventario';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { traspasarStock } from './acciones';

export const metadata = { title: 'Traspasos · Inventario' };

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** INV-07: traspasos de mercadería entre zonas (incluye entre bodegas). */
export default async function Traspasos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('movimiento.ver');
  const puedeCrear = usuario.permisos.has('traspaso.crear');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [{ data: movimientos, count, error }, { data: zonas }] = await Promise.all([
    supabase
      .from('movimiento')
      .select(
        'id, tipo, cajas, fecha, motivo, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo)), usuario:usuario_id(nombre)',
        { count: 'exact' },
      )
      .eq('documento_tipo', 'TRASPASO')
      .order('fecha', { ascending: false })
      .range(desde, hasta),
    // Solo las zonas: el artículo lo busca el selector contra la base, así que
    // ya no se precarga el catálogo.
    supabase
      .from('zona')
      .select('id, codigo, bodega:bodega_id(codigo, nombre, color)')
      .eq('activo', true)
      .order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los traspasos: {error.message}</Vacio>;

  const opcionesZona = (zonas ?? []).map((z) => ({
    id: z.id,
    codigo: z.codigo,
    bodega: z.bodega?.codigo ?? '—',
    bodegaNombre: z.bodega?.nombre ?? null,
    color: z.bodega?.color ?? 'gris',
  }));

  return (
    <>
      <Encabezado
        titulo="Traspasos"
        descripcion="Mercadería entre zonas y bodegas, ej. Arica–Iquique (INV-07)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={traspasarStock} etiquetaNuevo="Nuevo traspaso">
            <CamposTraspaso zonas={opcionesZona} />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(movimientos ?? []).length === 0 ? (
        <Vacio>
          No hay traspasos registrados.
          {puedeCrear ? ' Use «Nuevo traspaso» para el primero.' : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Artículo</Th>
              <Th>Movimiento</Th>
              <Th>Bodega · Zona</Th>
              <Th numerico>Cajas</Th>
              <Th>Usuario</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {(movimientos ?? []).map((m) => (
              <tr key={m.id}>
                <Td tenue>{fecha(m.fecha)}</Td>
                <Td>
                  <code className="text-xs">{m.variante.producto.codigo}</code>
                </Td>
                <Td>
                  <Etiqueta tono={m.tipo === 'TRASPASO_ENTRADA' ? 'verde' : 'neutro'}>
                    {m.tipo === 'TRASPASO_ENTRADA' ? 'Entrada' : 'Salida'}
                  </Etiqueta>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <DistintivoBodega
                      codigo={m.zona.bodega?.codigo ?? '—'}
                      color={m.zona.bodega?.color}
                      titulo={m.zona.bodega?.nombre}
                    />
                    <code className="text-xs">{m.zona.codigo}</code>
                  </span>
                </Td>
                <Td numerico>{numero(m.cajas)}</Td>
                <Td tenue>{m.usuario?.nombre ?? '—'}</Td>
                <Td tenue>{m.motivo ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
