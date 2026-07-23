import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

export const metadata = { title: 'Estadística mensual · Inventario' };

function nombreMes(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(
    new Date(`${iso}T00:00:00`),
  );
}

/** REP-02: salidas por mes; al elegir un mes, el detalle por producto. */
export default async function Estadistica({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const usuario = await requerirPermiso('reporte.ver');
  const puedeExportar = usuario.permisos.has('reporte.exportar');

  const supabase = await crearClienteServidor();
  const { data: filas, error } = await supabase
    .from('v_salidas_mensuales')
    .select('*')
    .order('mes', { ascending: false });

  if (error) return <Vacio>No se pudo cargar la estadística: {error.message}</Vacio>;

  const porMes = new Map<string, { cajas: number; unidades: number; productos: number }>();
  for (const f of filas ?? []) {
    const clave = f.mes!;
    const acumulado = porMes.get(clave) ?? { cajas: 0, unidades: 0, productos: 0 };
    acumulado.cajas += Number(f.cajas);
    acumulado.unidades += Number(f.unidades);
    acumulado.productos += 1;
    porMes.set(clave, acumulado);
  }

  const delMes = mes
    ? (filas ?? []).filter((f) => f.mes === mes).sort((a, b) => Number(b.cajas) - Number(a.cajas))
    : [];

  return (
    <>
      <Encabezado
        titulo="Estadística mensual"
        descripcion="Salidas por mes y por producto (REP-02)"
      >
        {puedeExportar ? (
          <a
            href="/api/exportar?tipo=estadistica"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Exportar a Excel
          </a>
        ) : null}
      </Encabezado>

      {porMes.size === 0 ? (
        <Vacio>Todavía no hay salidas registradas.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th numerico>Productos con salida</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {[...porMes.entries()].map(([clave, t]) => (
              <tr key={clave}>
                <Td>{nombreMes(clave)}</Td>
                <Td numerico tenue>
                  {numero(t.productos)}
                </Td>
                <Td numerico>{numero(t.cajas)}</Td>
                <Td numerico tenue>
                  {numero(t.unidades)}
                </Td>
                <Td>
                  <Link
                    href={`/reportes/estadistica?mes=${clave}`}
                    className="text-sm underline underline-offset-2"
                  >
                    ver detalle
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {mes && delMes.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium">Detalle de {nombreMes(mes)}</h2>
          <Tabla>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th>Categoría</Th>
                <Th numerico>Por caja</Th>
                <Th numerico>Cajas</Th>
                <Th numerico>Unidades</Th>
              </tr>
            </thead>
            <tbody>
              {delMes.map((f) => (
                <tr key={f.variante_id}>
                  <Td>
                    <code className="text-xs">{f.codigo}</code>
                  </Td>
                  <Td tenue>{f.categoria}</Td>
                  <Td numerico tenue>
                    {numero(f.unidades_por_caja)}
                  </Td>
                  <Td numerico>{numero(f.cajas)}</Td>
                  <Td numerico tenue>
                    {numero(f.unidades)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </section>
      ) : null}
    </>
  );
}
