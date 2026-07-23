import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { agregarDetalleVenta, confirmarVenta, crearVenta } from './acciones';

export const metadata = { title: 'Notas de venta · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

/** VEN-01/02: notas de venta con descuento de stock al confirmar. */
export default async function NotasDeVenta() {
  const usuario = await requerirPermiso('venta.ver');
  const puedeCrear = usuario.permisos.has('venta.crear');

  const supabase = await crearClienteServidor();

  const [
    { data: ventas, error },
    { data: clientes },
    { data: monedas },
    { data: variantes },
    { data: zonas },
    { data: vendedores },
  ] = await Promise.all([
    supabase
      .from('venta')
      .select(
        'id, fecha, tipo_cambio, estado, notas, comision_clp, comision_porcentaje, cliente:cliente_id(nombre, lista:lista_precio_id(nombre)), moneda:moneda_id(codigo, simbolo), vendedor:vendedor_id(usuario:usuario_id(nombre)), detalle:venta_detalle(id, cajas, precio_caja, zona:zona_id(codigo), variante:variante_id(unidades_por_caja, producto:producto_id(codigo)))',
      )
      .order('id', { ascending: false })
      .limit(50),
    supabase.from('cliente').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    supabase.from('moneda').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id!inner(codigo, activo)')
      .eq('activo', true)
      .eq('producto.activo', true)
      .limit(1000),
    supabase.from('zona').select('id, codigo').eq('activo', true).order('codigo'),
    supabase
      .from('vendedor')
      .select('id, usuario:usuario_id(nombre)')
      .eq('activo', true)
      .order('id'),
  ]);

  if (error) return <Vacio>No se pudieron cargar las ventas: {error.message}</Vacio>;

  const opcionesCliente = (clientes ?? []).map((c) => ({
    valor: c.id,
    texto: `${c.codigo} — ${c.nombre}`,
  }));
  const opcionesMoneda = (monedas ?? []).map((m) => ({
    valor: m.id,
    texto: `${m.codigo} — ${m.nombre}`,
  }));
  const opcionesVariante = (variantes ?? [])
    .sort((a, b) => a.producto.codigo.localeCompare(b.producto.codigo))
    .map((v) => ({
      valor: v.id,
      texto: `${v.producto.codigo} — ${numero(v.unidades_por_caja)} u/caja`,
    }));
  const opcionesZona = (zonas ?? []).map((z) => ({ valor: z.id, texto: z.codigo }));
  const opcionesVendedor = (vendedores ?? []).map((v) => ({
    valor: v.id,
    texto: v.usuario.nombre,
  }));

  return (
    <>
      <Encabezado
        titulo="Notas de venta"
        descripcion="Ventas a mayoristas con descuento de stock al confirmar (VEN-01, VEN-02)"
      >
        {puedeCrear ? (
          <FormularioDesplegable accion={crearVenta} etiquetaNuevo="Nueva venta">
            <Seleccion
              etiqueta="Cliente"
              nombre="cliente_id"
              opciones={opcionesCliente}
              requerido
            />
            <Seleccion etiqueta="Moneda" nombre="moneda_id" opciones={opcionesMoneda} requerido />
            {opcionesVendedor.length > 0 ? (
              <Seleccion
                etiqueta="Vendedor (opcional)"
                nombre="vendedor_id"
                opciones={opcionesVendedor}
              />
            ) : null}
            <Campo etiqueta="Tipo de cambio a CLP" nombre="tipo_cambio" tipo="number" />
            <Campo etiqueta="Fecha" nombre="fecha" tipo="date" />
            <Campo etiqueta="Notas" nombre="notas" ancho="completo" />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(ventas ?? []).length === 0 ? (
        <Vacio>
          No hay ventas registradas.
          {puedeCrear ? ' Use «Nueva venta» para crear el primer borrador.' : ''}
        </Vacio>
      ) : (
        <div className="space-y-8">
          {(ventas ?? []).map((venta) => {
            const totalCajas = venta.detalle.reduce((s, d) => s + Number(d.cajas), 0);
            const totalMonto = venta.detalle.reduce(
              (s, d) => s + Number(d.cajas) * Number(d.precio_caja ?? 0),
              0,
            );
            const esBorrador = venta.estado === 'BORRADOR';
            return (
              <section
                key={venta.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold">Venta #{venta.id}</h2>
                  <Etiqueta tono={esBorrador ? 'ambar' : 'verde'}>
                    {esBorrador ? 'Borrador' : 'Confirmada'}
                  </Etiqueta>
                  <span className="text-sm text-zinc-500">
                    {fecha(venta.fecha)} · {venta.cliente.nombre}
                    {venta.cliente.lista ? ` (lista ${venta.cliente.lista.nombre})` : ''} ·{' '}
                    {venta.moneda.codigo}
                    {venta.tipo_cambio ? ` (TC ${numero(venta.tipo_cambio)})` : ''}
                    {venta.vendedor ? ` · vendedor: ${venta.vendedor.usuario.nombre}` : ''}
                    {venta.comision_clp !== null
                      ? ` (comisión ${numero(venta.comision_porcentaje)} % = $ ${numero(venta.comision_clp)})`
                      : ''}
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">
                    {numero(totalCajas)} cajas · {venta.moneda.simbolo ?? ''} {numero(totalMonto)}
                  </span>
                </div>

                {venta.detalle.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin detalle todavía.</p>
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Artículo</Th>
                        <Th>Zona origen</Th>
                        <Th numerico>Cajas</Th>
                        <Th numerico>Precio caja</Th>
                        <Th numerico>Subtotal</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {venta.detalle.map((d) => (
                        <tr key={d.id}>
                          <Td>
                            <code className="text-xs">{d.variante.producto.codigo}</code>
                            <span className="ml-2 text-xs text-zinc-500">
                              {numero(d.variante.unidades_por_caja)} u/caja
                            </span>
                          </Td>
                          <Td tenue>{d.zona.codigo}</Td>
                          <Td numerico>{numero(d.cajas)}</Td>
                          <Td numerico tenue>
                            {d.precio_caja === null ? '—' : numero(d.precio_caja)}
                          </Td>
                          <Td numerico>
                            {d.precio_caja === null
                              ? '—'
                              : numero(Number(d.cajas) * Number(d.precio_caja))}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}

                {esBorrador && puedeCrear ? (
                  <div className="mt-4 flex flex-wrap items-start gap-4">
                    <FormularioDesplegable
                      accion={agregarDetalleVenta}
                      etiquetaNuevo="Agregar detalle"
                    >
                      <input type="hidden" name="venta_id" value={venta.id} />
                      <Seleccion
                        etiqueta="Artículo"
                        nombre="variante_id"
                        opciones={opcionesVariante}
                        requerido
                      />
                      <Seleccion
                        etiqueta="Zona de origen"
                        nombre="zona_id"
                        opciones={opcionesZona}
                        requerido
                      />
                      <Campo etiqueta="Cajas" nombre="cajas" tipo="number" requerido ejemplo="2" />
                      <Campo
                        etiqueta={`Precio por caja (${venta.moneda.codigo}, vacío = lista del cliente)`}
                        nombre="precio_caja"
                        tipo="number"
                      />
                    </FormularioDesplegable>

                    {venta.detalle.length > 0 ? (
                      <FormularioDesplegable
                        accion={confirmarVenta}
                        etiquetaNuevo="Confirmar y descontar stock"
                      >
                        <input type="hidden" name="venta_id" value={venta.id} />
                        <p className="text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                          Se generará una SALIDA por cada línea ({numero(totalCajas)} cajas). Si
                          alguna línea supera el stock disponible, la confirmación completa fallará.
                          No se puede deshacer desde aquí.
                        </p>
                      </FormularioDesplegable>
                    ) : null}
                  </div>
                ) : null}

                {venta.notas ? <p className="mt-3 text-sm text-zinc-500">{venta.notas}</p> : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
