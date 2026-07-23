import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { traspasarStock } from './acciones';

export const metadata = { title: 'Traspasos · Inventario' };

const LIMITE = 100;

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** INV-07: traspasos de mercadería entre zonas (incluye entre bodegas). */
export default async function Traspasos() {
  const usuario = await requerirPermiso('movimiento.ver');
  const puedeCrear = usuario.permisos.has('traspaso.crear');

  const supabase = await crearClienteServidor();

  const [{ data: movimientos, error }, { data: variantes }, { data: zonas }] = await Promise.all([
    supabase
      .from('movimiento')
      .select(
        'id, tipo, cajas, fecha, motivo, zona:zona_id(codigo, bodega:bodega_id(codigo)), variante:variante_id(producto:producto_id(codigo)), usuario:usuario_id(nombre)',
      )
      .eq('documento_tipo', 'TRASPASO')
      .order('fecha', { ascending: false })
      .limit(LIMITE),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
    supabase
      .from('zona')
      .select('id, codigo, bodega:bodega_id(codigo)')
      .eq('activo', true)
      .order('codigo'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los traspasos: {error.message}</Vacio>;

  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja`,
    }));
  const opcionesZona = (zonas ?? []).map((z) => ({
    valor: z.id,
    texto: `${z.bodega?.codigo ?? '—'} · ${z.codigo}`,
  }));

  return (
    <>
      <Encabezado
        titulo="Traspasos"
        descripcion="Mercadería entre zonas y bodegas, ej. Arica–Iquique (INV-07)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={traspasarStock} etiquetaNuevo="Nuevo traspaso">
            <Seleccion
              etiqueta="Artículo"
              nombre="variante_id"
              opciones={opcionesVariante}
              requerido
            />
            <Campo etiqueta="Cajas" nombre="cajas" tipo="number" requerido ejemplo="10" />
            <Seleccion
              etiqueta="Zona de origen"
              nombre="zona_origen"
              opciones={opcionesZona}
              requerido
            />
            <Seleccion
              etiqueta="Zona de destino"
              nombre="zona_destino"
              opciones={opcionesZona}
              requerido
            />
            <Campo etiqueta="Motivo" nombre="motivo" ancho="completo" />
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
                <Td tenue>
                  {m.zona.bodega?.codigo ?? '—'} · {m.zona.codigo}
                </Td>
                <Td numerico>{numero(m.cajas)}</Td>
                <Td tenue>{m.usuario?.nombre ?? '—'}</Td>
                <Td tenue>{m.motivo ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
