import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { Paginacion } from '@/components/paginacion';
import { leerPaginacion } from '@/lib/paginacion';
import { guardarTipoCambio } from './acciones';

export const metadata = { title: 'Tipo de cambio · Inventario' };

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(
    new Date(`${valor}T00:00:00`),
  );
}

interface Cambio {
  id: number;
  fecha: string;
  valor: number;
  fuente: string | null;
}

function Campos({ c, hoy }: { c?: Cambio; hoy: string }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo
        etiqueta="Fecha"
        nombre="fecha"
        valor={c?.fecha ?? hoy}
        tipo="date"
        requerido
        ayuda="Rige desde este día hasta que se cargue uno más nuevo"
      />
      <Campo
        etiqueta="Pesos por dólar"
        nombre="valor"
        valor={c?.valor}
        tipo="number"
        requerido
        minimo={0.0001}
        paso="any"
        ejemplo="947,30"
      />
      <Campo
        etiqueta="Fuente"
        nombre="fuente"
        valor={c?.fuente}
        ejemplo="Banco Central de Chile"
        ancho="completo"
        ayuda="De dónde salió el valor, para poder revisarlo después"
      />
      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-tenue sm:col-span-2 dark:bg-zinc-800">
        Esto manda sobre los documentos <strong>nuevos</strong>. Las ventas e importaciones ya
        creadas conservan el tipo de cambio que regía el día que se emitieron, y no cambian aunque
        se corrija este valor.
      </p>
    </>
  );
}

/**
 * El tipo de cambio del dólar: un solo valor por día, en un solo lugar.
 *
 * Los precios se deciden en dólares (0023/0024) y una venta en pesos sale de
 * multiplicar por este número, así que es el dato más sensible del sistema: si
 * se carga mal, todos los precios en pesos salen mal. Por eso no se teclea en
 * cada venta —donde nadie podía comparar contra nada— sino aquí, donde se ve
 * la serie completa y un valor fuera de lugar salta a la vista.
 *
 * Cada documento se queda con una copia del valor del día en que se creó
 * (`fn_documento_tipo_cambio`, migración 0025). Corregir una fila de esta
 * tabla no reescribe historia.
 *
 * No hay opción de borrar a propósito: sin ningún tipo de cambio cargado la
 * base rechaza crear ventas e importaciones.
 */
export default async function TipoDeCambio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('moneda.editar');
  const { pagina, porPagina, desde, hasta } = leerPaginacion(await searchParams);

  const supabase = await crearClienteServidor();
  const hoy = new Date().toISOString().slice(0, 10);

  const [{ data: cambios, count, error }, { data: vigente }] = await Promise.all([
    supabase
      .from('tipo_cambio')
      .select('id, fecha, valor, fuente, moneda:moneda_id!inner(codigo)', { count: 'exact' })
      .eq('moneda.codigo', 'USD')
      .order('fecha', { ascending: false })
      .range(desde, hasta),
    // El mismo valor que van a tomar los documentos que se creen hoy: se
    // pregunta a la base en vez de deducirlo de la lista, para que la pantalla
    // no pueda decir una cosa y la base hacer otra.
    supabase.rpc('fn_tipo_cambio_vigente', { p_fecha: hoy }),
  ]);

  if (error) return <Vacio>No se pudo cargar el tipo de cambio: {error.message}</Vacio>;

  const filas = cambios ?? [];
  const deHoy = filas.find((c) => c.fecha === hoy);

  return (
    <>
      <Encabezado
        titulo="Tipo de cambio"
        descripcion="Cuántos pesos vale un dólar. De aquí sale el precio en pesos de toda venta"
      >
        <FormularioDesplegable
          accion={guardarTipoCambio}
          etiquetaNuevo={deHoy ? 'Cargar otra fecha' : 'Cargar el de hoy'}
        >
          <Campos hoy={hoy} />
        </FormularioDesplegable>
      </Encabezado>

      <section className="mb-6 rounded-xl border border-borde bg-superficie p-4">
        {vigente === null ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            <strong>No hay ningún tipo de cambio cargado.</strong> Mientras no lo haya, la base
            rechaza crear ventas e importaciones: no habría con qué valorizarlas en pesos.
          </p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-tenue">Un dólar vale hoy</span>
            <span className="text-2xl font-semibold tabular-nums">$ {numero(vigente)}</span>
            {deHoy ? (
              <Etiqueta tono="verde">cargado hoy</Etiqueta>
            ) : (
              <Etiqueta tono="ambar">de una fecha anterior</Etiqueta>
            )}
            <p className="w-full text-xs text-tenue">
              Es el valor que va a quedar grabado en cada venta e importación que se cree hoy.
              {deHoy ? '' : ' Cargue el de hoy si el dólar se movió.'}
            </p>
          </div>
        )}
      </section>

      {filas.length === 0 ? (
        <Vacio>
          No hay tipos de cambio cargados. Use «Cargar el de hoy» para empezar la serie.
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th numerico>Pesos por dólar</Th>
              <Th>Fuente</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id}>
                <Td>
                  {fecha(c.fecha)}
                  {c.fecha === hoy ? <span className="ml-2 text-xs text-tenue">hoy</span> : null}
                </Td>
                <Td numerico>$ {numero(c.valor)}</Td>
                <Td tenue>{c.fuente ?? '—'}</Td>
                <Td>
                  <FormularioDesplegable accion={guardarTipoCambio} etiquetaNuevo="" esEdicion>
                    <Campos c={c} hoy={hoy} />
                  </FormularioDesplegable>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
