import Link from 'next/link';
import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

export const metadata = { title: 'Resumen · Inventario' };

function Tarjeta({
  titulo,
  valor,
  enlace,
  tono,
}: {
  titulo: string;
  valor: string;
  enlace?: string;
  tono?: 'ambar';
}) {
  const contenido = (
    <div
      className={`rounded-lg border p-4 ${
        tono === 'ambar'
          ? 'border-amber-300 dark:border-amber-800'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <p className="text-xs text-zinc-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
  return enlace ? (
    <Link href={enlace} className="block hover:opacity-80">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

/** REP-01: resumen de existencias por categoría, más indicadores generales. */
export default async function Resumen() {
  const usuario = await requerirUsuario();
  const supabase = await crearClienteServidor();

  const puedeVerValor = usuario.permisos.has('reporte.ver');
  const puedeVerAlertas = usuario.permisos.has('stock.ver');
  const puedeVerMovimientos = usuario.permisos.has('movimiento.ver');

  const [{ data: categorias }, valorizacion, alertas, movimientosHoy] = await Promise.all([
    supabase.from('v_resumen_categoria').select('*').order('categoria'),
    puedeVerValor
      ? supabase.from('v_valorizacion').select('valor_clp')
      : Promise.resolve({ data: null }),
    puedeVerAlertas
      ? supabase.from('v_alertas_stock').select('variante_id', { count: 'exact', head: true })
      : Promise.resolve({ count: null }),
    puedeVerMovimientos
      ? supabase
          .from('movimiento')
          .select('id', { count: 'exact', head: true })
          .gte('fecha', new Date().toISOString().slice(0, 10))
      : Promise.resolve({ count: null }),
  ]);

  const totalCajas = (categorias ?? []).reduce((s, c) => s + Number(c.cajas ?? 0), 0);
  const totalUnidades = (categorias ?? []).reduce((s, c) => s + Number(c.unidades ?? 0), 0);
  const totalArticulos = (categorias ?? []).reduce((s, c) => s + Number(c.articulos ?? 0), 0);
  const valorTotal = (valorizacion.data ?? []).reduce((s, f) => s + Number(f.valor_clp ?? 0), 0);

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion="Existencias por categoría"
      />

      {totalArticulos > 0 ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {puedeVerValor ? (
            <Tarjeta
              titulo="Valor del inventario"
              valor={`$ ${numero(valorTotal)}`}
              enlace="/reportes/valorizacion"
            />
          ) : null}
          {puedeVerAlertas ? (
            <Tarjeta
              titulo="Artículos en alerta de stock"
              valor={numero(alertas.count ?? 0)}
              enlace="/inventario/alertas"
              tono={(alertas.count ?? 0) > 0 ? 'ambar' : undefined}
            />
          ) : null}
          {puedeVerMovimientos ? (
            <Tarjeta
              titulo="Movimientos de hoy"
              valor={numero(movimientosHoy.count ?? 0)}
              enlace="/inventario/movimientos"
            />
          ) : null}
        </div>
      ) : null}

      {totalArticulos === 0 ? (
        <Vacio>
          Todavía no hay artículos cargados.
          <br />
          El catálogo se poblará al migrar <code>BODEGA.xls</code>.
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Categoría</Th>
              <Th numerico>Artículos</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
            </tr>
          </thead>
          <tbody>
            {(categorias ?? []).map((c) => (
              <tr key={c.categoria_id}>
                <Td>
                  {c.categoria}
                  {c.nombre_zh ? (
                    <span className="ml-2 text-xs text-zinc-500">{c.nombre_zh}</span>
                  ) : null}
                </Td>
                <Td numerico>{numero(c.articulos)}</Td>
                <Td numerico>{numero(c.cajas)}</Td>
                <Td numerico>{numero(c.unidades)}</Td>
              </tr>
            ))}
            <tr className="font-medium">
              <Td>Total</Td>
              <Td numerico>{numero(totalArticulos)}</Td>
              <Td numerico>{numero(totalCajas)}</Td>
              <Td numerico>{numero(totalUnidades)}</Td>
            </tr>
          </tbody>
        </Tabla>
      )}
    </>
  );
}
