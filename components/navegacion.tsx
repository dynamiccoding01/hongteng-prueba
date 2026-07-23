import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Barcode,
  Boxes,
  Building2,
  ClipboardCheck,
  Coins,
  Handshake,
  History,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  Stamp,
  Tag,
  Tags,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { UsuarioSesion } from '@/lib/auth';
import type { Idioma } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import type { Tema } from '@/lib/preferencias';
import { cerrarSesion } from '@/app/login/acciones';
import { EnlaceNav } from './enlace-nav';
import { SelectorTema } from './selector-tema';

interface Enlace {
  href: string;
  clave: Parameters<typeof t>[1];
  icono: LucideIcon;
  /** Permiso necesario para ver el enlace. Sin permiso, no se muestra. */
  permiso?: string;
}

const SECCIONES: { claveTitulo: Parameters<typeof t>[1]; enlaces: Enlace[] }[] = [
  {
    claveTitulo: 'seccionInventario',
    enlaces: [
      { href: '/', clave: 'navResumen', icono: LayoutDashboard },
      { href: '/articulos', clave: 'navBuscarArticulos', icono: Search, permiso: 'stock.ver' },
      { href: '/inventario/stock', clave: 'navStockPorZona', icono: Boxes, permiso: 'stock.ver' },
      {
        href: '/inventario/movimientos',
        clave: 'navMovimientos',
        icono: ArrowLeftRight,
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/kardex',
        clave: 'navKardex',
        icono: ClipboardCheck,
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/alertas',
        clave: 'navAlertasStock',
        icono: AlertTriangle,
        permiso: 'stock.ver',
      },
      {
        href: '/inventario/traspasos',
        clave: 'navTraspasos',
        icono: ArrowLeftRight,
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/toma',
        clave: 'navTomaInventario',
        icono: ClipboardCheck,
        permiso: 'toma.ver',
      },
      {
        href: '/inventario/buscar-codigo',
        clave: 'navBuscarCodigo',
        icono: ScanLine,
        permiso: 'stock.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionMaestros',
    enlaces: [
      {
        href: '/maestros/productos',
        clave: 'navProductos',
        icono: Package,
        permiso: 'producto.ver',
      },
      {
        href: '/maestros/categorias',
        clave: 'navCategorias',
        icono: Tags,
        permiso: 'categoria.ver',
      },
      { href: '/maestros/zonas', clave: 'navBodegasZonas', icono: Warehouse, permiso: 'zona.ver' },
      {
        href: '/maestros/proveedores',
        clave: 'navProveedores',
        icono: Truck,
        permiso: 'proveedor.ver',
      },
      { href: '/maestros/clientes', clave: 'navClientes', icono: Users, permiso: 'cliente.ver' },
      {
        href: '/maestros/codigos',
        clave: 'navCodigosBarras',
        icono: Barcode,
        permiso: 'producto.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionCompras',
    enlaces: [
      {
        href: '/compras/importaciones',
        clave: 'navImportaciones',
        icono: Ship,
        permiso: 'importacion.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionVentas',
    enlaces: [
      { href: '/ventas/notas', clave: 'navNotasVenta', icono: Receipt, permiso: 'venta.ver' },
      { href: '/ventas/precios', clave: 'navListasPrecios', icono: Tag, permiso: 'venta.ver' },
      {
        href: '/ventas/traspasos-aduana',
        clave: 'navTraspasosAduana',
        icono: Stamp,
        permiso: 'documento_traspaso.ver',
      },
      {
        href: '/ventas/vendedores',
        clave: 'navVendedores',
        icono: Handshake,
        permiso: 'vendedor.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionReportes',
    enlaces: [
      {
        href: '/reportes/estadistica',
        clave: 'navEstadisticaMensual',
        icono: BarChart3,
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/valorizacion',
        clave: 'navValorizacion',
        icono: Coins,
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/ventas',
        clave: 'navVentasPorPeriodo',
        icono: BarChart3,
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/comisiones',
        clave: 'navComisiones',
        icono: Percent,
        permiso: 'comision.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionAdministracion',
    enlaces: [
      { href: '/admin/usuarios', clave: 'navUsuarios', icono: UserCog, permiso: 'usuario.ver' },
      {
        href: '/admin/roles',
        clave: 'navRolesPermisos',
        icono: ShieldCheck,
        permiso: 'rol.editar',
      },
      { href: '/admin/empresa', clave: 'navEmpresa', icono: Building2, permiso: 'empresa.ver' },
      { href: '/ajustes', clave: 'navAjustes', icono: Settings },
      { href: '/bitacora', clave: 'navBitacora', icono: History },
    ],
  },
];

export function Navegacion({
  usuario,
  idioma,
  tema,
}: {
  usuario: UsuarioSesion;
  idioma: Idioma;
  tema: Tema;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-acento text-white">
          <Boxes className="size-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] tracking-widest text-zinc-500 uppercase">
            HONG TENG LTDA
          </p>
          <p className="truncate text-sm font-semibold">{t(idioma, 'subtituloMenu')}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {SECCIONES.map((seccion) => {
          const visibles = seccion.enlaces.filter(
            (e) => !e.permiso || usuario.permisos.has(e.permiso),
          );
          if (visibles.length === 0) return null;

          return (
            <div key={seccion.claveTitulo} className="mb-4">
              <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                {t(idioma, seccion.claveTitulo)}
              </p>
              <ul className="space-y-0.5">
                {visibles.map((enlace) => (
                  <li key={enlace.href}>
                    <EnlaceNav href={enlace.href} icono={enlace.icono}>
                      {t(idioma, enlace.clave)}
                    </EnlaceNav>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <SelectorTema temaActual={tema} idioma={idioma} />
        <p className="mt-3 truncate text-sm font-medium">{usuario.nombre}</p>
        <p className="truncate text-xs text-zinc-500">{usuario.rol}</p>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="mt-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {t(idioma, 'cerrarSesion')}
          </button>
        </form>
      </div>
    </aside>
  );
}
