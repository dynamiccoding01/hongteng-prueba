import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { anularDocumento, emitirDocumento } from './acciones';

export const metadata = { title: 'Traspasos ante Aduanas · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** VEN-03: documentos de traspaso de mercaderías ante Aduanas (formato 203). */
export default async function TraspasosAduana() {
  const usuario = await requerirPermiso('documento_traspaso.ver');
  const puedeEmitir = usuario.permisos.has('documento_traspaso.crear');

  const supabase = await crearClienteServidor();

  const [{ data: documentos, error }, { data: ventasConfirmadas }] = await Promise.all([
    supabase
      .from('documento_traspaso')
      .select(
        'id, folio, fecha, adquiriente_nombre, adquiriente_rut, procedencia, destino, estado, venta:venta_id(id, cliente:cliente_id(nombre))',
      )
      .order('id', { ascending: false })
      .limit(50),
    supabase
      .from('venta')
      .select('id, fecha, cliente:cliente_id(nombre, rut)')
      .eq('estado', 'CONFIRMADA')
      .order('id', { ascending: false })
      .limit(200),
  ]);

  if (error) return <Vacio>No se pudieron cargar los documentos: {error.message}</Vacio>;

  const ventasConDocumento = new Set((documentos ?? []).map((d) => d.venta.id));
  const ventasPendientes = (ventasConfirmadas ?? []).filter((v) => !ventasConDocumento.has(v.id));
  const opcionesVenta = ventasPendientes.map((v) => ({
    valor: v.id,
    texto: `Venta #${v.id} — ${v.cliente.nombre} (${fecha(v.fecha)})`,
  }));

  return (
    <>
      <Encabezado
        titulo="Traspasos ante Aduanas"
        descripcion="Documento 203 emitido desde una venta confirmada (VEN-03)"
      >
        {puedeEmitir && opcionesVenta.length > 0 ? (
          <FormularioDesplegable accion={emitirDocumento} etiquetaNuevo="Emitir documento">
            <Seleccion etiqueta="Venta" nombre="venta_id" opciones={opcionesVenta} requerido />
            <Campo
              etiqueta="Nombre del adquiriente"
              nombre="adquiriente_nombre"
              requerido
              ancho="completo"
            />
            <Campo etiqueta="RUT del adquiriente" nombre="adquiriente_rut" ejemplo="76.123.456-7" />
            <Campo etiqueta="Destino" nombre="destino" ejemplo="La Paz, Bolivia" />
            <Campo etiqueta="Observaciones" nombre="observaciones" ancho="completo" />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {puedeEmitir && opcionesVenta.length === 0 && (documentos ?? []).length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          No hay ventas confirmadas todavía sin documento. Confirme una venta en «Notas de venta»
          para poder emitir su traspaso.
        </p>
      ) : null}

      {(documentos ?? []).length === 0 ? (
        <Vacio>No hay documentos de traspaso emitidos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Folio</Th>
              <Th>Fecha</Th>
              <Th>Venta</Th>
              <Th>Adquiriente</Th>
              <Th>Destino</Th>
              <Th>Estado</Th>
              {puedeEmitir ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {(documentos ?? []).map((d) => (
              <tr key={d.id}>
                <Td>
                  <code className="text-xs">{d.folio}</code>
                </Td>
                <Td tenue>{fecha(d.fecha)}</Td>
                <Td tenue>
                  #{d.venta.id} — {d.venta.cliente.nombre}
                </Td>
                <Td>
                  {d.adquiriente_nombre}
                  {d.adquiriente_rut ? (
                    <span className="ml-2 text-xs text-zinc-500">{d.adquiriente_rut}</span>
                  ) : null}
                </Td>
                <Td tenue>{d.destino ?? '—'}</Td>
                <Td>
                  <Etiqueta tono={d.estado === 'EMITIDO' ? 'verde' : 'neutro'}>{d.estado}</Etiqueta>
                </Td>
                {puedeEmitir ? (
                  <Td>
                    {d.estado === 'EMITIDO' ? (
                      <FormularioDesplegable accion={anularDocumento} etiquetaNuevo="" esEdicion>
                        <input type="hidden" name="documento_id" value={d.id} />
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
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
