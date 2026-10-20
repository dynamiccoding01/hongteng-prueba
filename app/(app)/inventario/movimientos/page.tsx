import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { CamposMovimiento } from '@/components/campos-inventario';
import { DistintivoBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { nombreEnvase } from '@/lib/inventario/articulo';
import { anularMovimiento, registrarMovimiento } from './acciones';

export const metadata = { title: 'Movimientos · Inventario' };

const TIPOS: Record<string, { texto: string; tono: 'verde' | 'ambar' | 'neutro' }> = {
  ENTRADA: { texto: 'Entrada', tono: 'verde' },
  SALIDA: { texto: 'Salida', tono: 'neutro' },
  AJUSTE_POSITIVO: { texto: 'Ajuste +', tono: 'ambar' },
  AJUSTE_NEGATIVO: { texto: 'Ajuste −', tono: 'ambar' },
  TRASPASO_SALIDA: { texto: 'Traspaso −', tono: 'neutro' },
  TRASPASO_ENTRADA: { texto: 'Traspaso +', tono: 'verde' },
};

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** INV-02: registro y consulta de movimientos (kardex global). */
export default async function Movimientos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('movimiento.ver');
  const puedeCrear = usuario.permisos.has('movimiento.crear');
  const puedeAnular = usuario.permisos.has('movimiento.anular');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();

  const [{ data: movimientos, count, error }, { data: zonas }] = await Promise.all([
    supabase
      .from('movimiento')
      .select(
        'id, tipo, cajas, unidades, saldo_cajas, motivo, fecha, anulado_por, zona:zona_id(codigo, bodega:bodega_id(codigo, nombre, color)), variante:variante_id(unidades_por_caja, producto:producto_id(codigo, unidad:unidad_medida_id(nombre_es))), usuario:usuario_id(nombre)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false })
      .range(desde, hasta),
    // Las zonas son pocas (una por ubicación física) y el formulario las
    // necesita todas para una entrada. Los artículos ya no se precargan: el
    // selector los busca contra la base.
    supabase
      .from('zona')
      .select('id, codigo, bodega:bodega_id(codigo, nombre, color)')
      .eq('activo', true)
      .order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los movimientos: {error.message}</Vacio>;

  const anulados = new Set(
    (movimientos ?? []).map((m) => m.anulado_por).filter((id): id is number => id !== null),
  );

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
        titulo="Movimientos"
        descripcion="Entradas, salidas y ajustes con su kardex (INV-02)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={registrarMovimiento} etiquetaNuevo="Nuevo movimiento">
            <CamposMovimiento zonas={opcionesZona} />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(movimientos ?? []).length === 0 ? (
        <Vacio>
          Todavía no hay movimientos registrados.
          {puedeCrear ? ' Use «Nuevo movimiento» para la primera entrada.' : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Artículo</Th>
              <Th>Bodega · Zona</Th>
              <Th>Tipo</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
              <Th numerico>Saldo zona</Th>
              <Th>Usuario</Th>
              <Th>Motivo</Th>
              {puedeAnular ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {(movimientos ?? []).map((m) => {
              const t = TIPOS[m.tipo] ?? { texto: m.tipo, tono: 'neutro' as const };
              const esAnulacion = m.anulado_por !== null;
              const fueAnulado = anulados.has(m.id);
              return (
                <tr key={m.id} className={fueAnulado ? 'opacity-50' : ''}>
                  <Td tenue>{fecha(m.fecha)}</Td>
                  <Td>
                    <code className="text-xs">{m.variante.producto.codigo}</code>
                    <span className="ml-2 text-xs text-tenue">
                      {nombreEnvase(m.variante.producto.unidad?.nombre_es ?? null)} de{' '}
                      {numero(m.variante.unidades_por_caja)}
                    </span>
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
                  <Td>
                    <Etiqueta tono={t.tono}>{t.texto}</Etiqueta>
                    {esAnulacion ? (
                      <span className="ml-1 text-xs text-zinc-500">anula #{m.anulado_por}</span>
                    ) : null}
                    {fueAnulado ? (
                      <span className="ml-1 text-xs text-zinc-500">anulado</span>
                    ) : null}
                  </Td>
                  <Td numerico>{numero(m.cajas)}</Td>
                  <Td numerico tenue>
                    {numero(m.unidades)}
                  </Td>
                  <Td numerico>{numero(m.saldo_cajas)}</Td>
                  <Td tenue>{m.usuario?.nombre ?? '—'}</Td>
                  <Td tenue>{m.motivo ?? '—'}</Td>
                  {puedeAnular ? (
                    <Td>
                      {!fueAnulado && !esAnulacion ? (
                        <FormularioDesplegable accion={anularMovimiento} etiquetaNuevo="" esEdicion>
                          <input type="hidden" name="movimiento_id" value={m.id} />
                          <Campo
                            etiqueta="Motivo de la anulación"
                            nombre="motivo"
                            requerido
                            ancho="completo"
                          />
                        </FormularioDesplegable>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
