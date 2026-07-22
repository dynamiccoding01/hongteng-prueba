import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { anularMovimiento, registrarMovimiento } from './acciones';

export const metadata = { title: 'Movimientos · Inventario' };

const LIMITE = 100;

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
export default async function Movimientos() {
  const usuario = await requerirPermiso('movimiento.ver');
  const puedeCrear = usuario.permisos.has('movimiento.crear');
  const puedeAnular = usuario.permisos.has('movimiento.anular');

  const supabase = await crearClienteServidor();

  const [{ data: movimientos, error }, { data: variantes }, { data: zonas }] = await Promise.all([
    supabase
      .from('movimiento')
      .select(
        'id, tipo, cajas, unidades, saldo_cajas, motivo, fecha, anulado_por, zona:zona_id(codigo), variante:variante_id(unidades_por_caja, producto:producto_id(codigo)), usuario:usuario_id(nombre)',
      )
      .order('fecha', { ascending: false })
      .limit(LIMITE),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
    supabase.from('zona').select('id, codigo').eq('activo', true).order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los movimientos: {error.message}</Vacio>;

  const anulados = new Set(
    (movimientos ?? []).map((m) => m.anulado_por).filter((id): id is number => id !== null),
  );

  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja`,
    }));
  const opcionesZona = (zonas ?? []).map((z) => ({ valor: z.id, texto: z.codigo }));

  return (
    <>
      <Encabezado
        titulo="Movimientos"
        descripcion="Entradas, salidas y ajustes con su kardex (INV-02)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={registrarMovimiento} etiquetaNuevo="Nuevo movimiento">
            <Seleccion
              etiqueta="Artículo"
              nombre="variante_id"
              opciones={opcionesVariante}
              requerido
            />
            <Seleccion etiqueta="Zona" nombre="zona_id" opciones={opcionesZona} requerido />
            <Seleccion
              etiqueta="Tipo"
              nombre="tipo"
              opciones={[
                { valor: 'ENTRADA', texto: 'Entrada' },
                { valor: 'SALIDA', texto: 'Salida' },
                { valor: 'AJUSTE_POSITIVO', texto: 'Ajuste positivo' },
                { valor: 'AJUSTE_NEGATIVO', texto: 'Ajuste negativo' },
              ]}
              requerido
            />
            <Campo etiqueta="Cajas" nombre="cajas" tipo="number" requerido ejemplo="5" />
            <Campo
              etiqueta="Motivo"
              nombre="motivo"
              ancho="completo"
              ejemplo="Obligatorio en ajustes"
            />
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
              <Th>Zona</Th>
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
                  </Td>
                  <Td tenue>{m.zona.codigo}</Td>
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
    </>
  );
}
