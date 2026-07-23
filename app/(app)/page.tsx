import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  Receipt,
  ScanLine,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

export const metadata = { title: 'Resumen · Inventario' };

function TarjetaIndicador({
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
      className={`rounded-xl border p-4 ${
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
    <Link href={enlace} className="block transition hover:opacity-80">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

/** Botón grande de acceso directo a la acción más frecuente del rol. */
function AccionRapida({
  href,
  icono: Icono,
  texto,
}: {
  href: string;
  icono: LucideIcon;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 p-4 transition hover:border-acento hover:bg-acento/5 dark:border-zinc-800"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-acento/10 text-acento">
        <Icono className="size-5" />
      </span>
      <span className="text-sm font-medium">{texto}</span>
    </Link>
  );
}

const HOY = () => new Date().toISOString().slice(0, 10);

/** REP-01: resumen de existencias por categoría, con accesos rápidos y avisos. */
export default async function Resumen() {
  const usuario = await requerirUsuario();
  const supabase = await crearClienteServidor();
  const permisos = usuario.permisos;

  const puedeVerValor = permisos.has('reporte.ver');
  const puedeVerAlertas = permisos.has('stock.ver');
  const puedeVerMovimientos = permisos.has('movimiento.ver');
  const puedeVerVentas = permisos.has('venta.ver');
  const puedeVerImportaciones = permisos.has('importacion.ver');

  const [
    { data: categorias },
    valorizacion,
    alertas,
    movimientosHoy,
    ventasBorrador,
    importacionesBorrador,
  ] = await Promise.all([
    supabase.from('v_resumen_categoria').select('*').order('categoria'),
    puedeVerValor
      ? supabase.from('v_valorizacion').select('valor_clp')
      : Promise.resolve({ data: null }),
    puedeVerAlertas
      ? supabase.from('v_alertas_stock').select('variante_id', { count: 'exact', head: true })
      : Promise.resolve({ count: null }),
    puedeVerMovimientos
      ? supabase.from('movimiento').select('id', { count: 'exact', head: true }).gte('fecha', HOY())
      : Promise.resolve({ count: null }),
    puedeVerVentas
      ? supabase.from('venta').select('id', { count: 'exact', head: true }).eq('estado', 'BORRADOR')
      : Promise.resolve({ count: null }),
    puedeVerImportaciones
      ? supabase
          .from('importacion')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'BORRADOR')
      : Promise.resolve({ count: null }),
  ]);

  const totalCajas = (categorias ?? []).reduce((s, c) => s + Number(c.cajas ?? 0), 0);
  const totalUnidades = (categorias ?? []).reduce((s, c) => s + Number(c.unidades ?? 0), 0);
  const totalArticulos = (categorias ?? []).reduce((s, c) => s + Number(c.articulos ?? 0), 0);
  const valorTotal = (valorizacion.data ?? []).reduce((s, f) => s + Number(f.valor_clp ?? 0), 0);

  const acciones: { href: string; icono: LucideIcon; texto: string }[] = [];
  if (permisos.has('movimiento.crear'))
    acciones.push({
      href: '/inventario/movimientos',
      icono: ArrowLeftRight,
      texto: 'Registrar movimiento',
    });
  if (permisos.has('venta.crear'))
    acciones.push({ href: '/ventas/notas', icono: Receipt, texto: 'Nueva venta' });
  if (permisos.has('importacion.crear'))
    acciones.push({ href: '/compras/importaciones', icono: Ship, texto: 'Nueva importación' });
  if (permisos.has('toma.crear'))
    acciones.push({ href: '/inventario/toma', icono: ClipboardCheck, texto: 'Toma de inventario' });
  if (permisos.has('stock.ver'))
    acciones.push({
      href: '/inventario/buscar-codigo',
      icono: ScanLine,
      texto: 'Buscar por código',
    });

  const nAlertas = alertas.count ?? 0;
  const nVentasBorrador = ventasBorrador.count ?? 0;
  const nImportacionesBorrador = importacionesBorrador.count ?? 0;

  const atencion: { href: string; icono: LucideIcon; texto: string }[] = [];
  if (nAlertas > 0)
    atencion.push({
      href: '/inventario/alertas',
      icono: AlertTriangle,
      texto: `${numero(nAlertas)} ${nAlertas === 1 ? 'artículo' : 'artículos'} en o bajo su stock mínimo`,
    });
  if (nVentasBorrador > 0)
    atencion.push({
      href: '/ventas/notas',
      icono: Receipt,
      texto: `${numero(nVentasBorrador)} ${nVentasBorrador === 1 ? 'venta' : 'ventas'} en borrador sin confirmar`,
    });
  if (nImportacionesBorrador > 0)
    atencion.push({
      href: '/compras/importaciones',
      icono: Ship,
      texto: `${numero(nImportacionesBorrador)} ${nImportacionesBorrador === 1 ? 'importación' : 'importaciones'} en borrador`,
    });

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion="Resumen de la operación"
      />

      {acciones.length > 0 ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {acciones.map((a) => (
            <AccionRapida key={a.href} href={a.href} icono={a.icono} texto={a.texto} />
          ))}
        </div>
      ) : null}

      {atencion.length > 0 ? (
        <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="mb-2 text-sm font-medium">Requiere atención</p>
          <ul className="space-y-1.5">
            {atencion.map(({ href, icono: Icono, texto }) => (
              <li key={texto}>
                <Link
                  href={href}
                  className="flex items-center gap-2 text-sm text-amber-800 hover:underline dark:text-amber-300"
                >
                  <Icono className="size-4 shrink-0" />
                  <span>{texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {totalArticulos > 0 ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {puedeVerValor ? (
            <TarjetaIndicador
              titulo="Valor del inventario"
              valor={`$ ${numero(valorTotal)}`}
              enlace="/reportes/valorizacion"
            />
          ) : null}
          {puedeVerAlertas ? (
            <TarjetaIndicador
              titulo="Artículos en alerta de stock"
              valor={numero(nAlertas)}
              enlace="/inventario/alertas"
              tono={nAlertas > 0 ? 'ambar' : undefined}
            />
          ) : null}
          {puedeVerMovimientos ? (
            <TarjetaIndicador
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
        <>
          <h2 className="mb-3 text-sm font-medium">Existencias por categoría</h2>
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
        </>
      )}
    </>
  );
}
