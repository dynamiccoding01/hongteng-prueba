import { LogOut, User } from 'lucide-react';
import type { UsuarioSesion } from '@/lib/auth';
import type { Idioma } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import type { Tema } from '@/lib/preferencias';
import { cerrarSesion } from '@/app/login/acciones';
import { BotonTema } from './boton-tema';
import { EnlaceNav } from './enlace-nav';
import { GrupoNav } from './grupo-nav';
import type { NombreIcono } from './iconos';

interface Enlace {
  href: string;
  clave: Parameters<typeof t>[1];
  icono: NombreIcono;
  /** Permiso necesario para ver el enlace. Sin permiso, no se muestra. */
  permiso?: string;
}

/** Inicio: siempre visible arriba, fuera de los módulos colapsables. */
const INICIO: Enlace = { href: '/', clave: 'navResumen', icono: 'LayoutDashboard' };

const SECCIONES: {
  claveTitulo: Parameters<typeof t>[1];
  icono: NombreIcono;
  enlaces: Enlace[];
}[] = [
  {
    claveTitulo: 'seccionInventario',
    icono: 'Boxes',
    enlaces: [
      { href: '/articulos', clave: 'navBuscarArticulos', icono: 'Search', permiso: 'stock.ver' },
      { href: '/inventario/stock', clave: 'navStockPorZona', icono: 'Boxes', permiso: 'stock.ver' },
      {
        href: '/inventario/movimientos',
        clave: 'navMovimientos',
        icono: 'ArrowLeftRight',
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/kardex',
        clave: 'navKardex',
        icono: 'ClipboardCheck',
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/alertas',
        clave: 'navAlertasStock',
        icono: 'AlertTriangle',
        permiso: 'stock.ver',
      },
      {
        href: '/inventario/traspasos',
        clave: 'navTraspasos',
        icono: 'ArrowLeftRight',
        permiso: 'movimiento.ver',
      },
      {
        href: '/inventario/toma',
        clave: 'navTomaInventario',
        icono: 'ClipboardCheck',
        permiso: 'toma.ver',
      },
      {
        href: '/inventario/buscar-codigo',
        clave: 'navBuscarCodigo',
        icono: 'ScanLine',
        permiso: 'stock.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionMaestros',
    icono: 'Library',
    enlaces: [
      {
        href: '/maestros/productos',
        clave: 'navProductos',
        icono: 'Package',
        permiso: 'producto.ver',
      },
      {
        href: '/maestros/categorias',
        clave: 'navCategorias',
        icono: 'Tags',
        permiso: 'categoria.ver',
      },
      {
        href: '/maestros/zonas',
        clave: 'navBodegasZonas',
        icono: 'Warehouse',
        permiso: 'zona.ver',
      },
      {
        href: '/maestros/proveedores',
        clave: 'navProveedores',
        icono: 'Truck',
        permiso: 'proveedor.ver',
      },
      { href: '/maestros/clientes', clave: 'navClientes', icono: 'Users', permiso: 'cliente.ver' },
      {
        href: '/maestros/codigos',
        clave: 'navCodigosBarras',
        icono: 'Barcode',
        permiso: 'producto.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionCompras',
    icono: 'ShoppingCart',
    enlaces: [
      {
        href: '/compras/importaciones',
        clave: 'navImportaciones',
        icono: 'Ship',
        permiso: 'importacion.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionVentas',
    icono: 'ShoppingBag',
    enlaces: [
      { href: '/ventas/notas', clave: 'navNotasVenta', icono: 'Receipt', permiso: 'venta.ver' },
      { href: '/ventas/precios', clave: 'navListasPrecios', icono: 'Tag', permiso: 'venta.ver' },
      {
        href: '/ventas/traspasos-aduana',
        clave: 'navTraspasosAduana',
        icono: 'Stamp',
        permiso: 'documento_traspaso.ver',
      },
      {
        href: '/ventas/vendedores',
        clave: 'navVendedores',
        icono: 'Handshake',
        permiso: 'vendedor.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionReportes',
    icono: 'BarChart3',
    enlaces: [
      {
        href: '/reportes/estadistica',
        clave: 'navEstadisticaMensual',
        icono: 'BarChart3',
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/valorizacion',
        clave: 'navValorizacion',
        icono: 'Coins',
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/ventas',
        clave: 'navVentasPorPeriodo',
        icono: 'BarChart3',
        permiso: 'reporte.ver',
      },
      {
        href: '/reportes/comisiones',
        clave: 'navComisiones',
        icono: 'Percent',
        permiso: 'comision.ver',
      },
    ],
  },
  {
    claveTitulo: 'seccionAdministracion',
    icono: 'Wrench',
    enlaces: [
      { href: '/admin/usuarios', clave: 'navUsuarios', icono: 'UserCog', permiso: 'usuario.ver' },
      {
        href: '/admin/roles',
        clave: 'navRolesPermisos',
        icono: 'ShieldCheck',
        permiso: 'rol.editar',
      },
      { href: '/admin/empresa', clave: 'navEmpresa', icono: 'Building2', permiso: 'empresa.ver' },
      { href: '/ajustes', clave: 'navAjustes', icono: 'Settings' },
      { href: '/bitacora', clave: 'navBitacora', icono: 'History' },
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
    <>
      <div className="border-b border-borde px-3 py-3">
        <p className="px-1 pb-2 text-[10px] font-semibold tracking-widest text-zinc-400 uppercase dark:text-zinc-500">
          Hong Teng Ltda
        </p>
        <div className="flex items-center gap-2.5 rounded-lg bg-zinc-100/70 px-2.5 py-2 dark:bg-zinc-800/50">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-acento text-white">
            <User className="size-[18px]" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
            <p className="truncate text-xs text-tenue">{usuario.rol}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="space-y-0.5">
          <li>
            <EnlaceNav href={INICIO.href} icono={INICIO.icono}>
              {t(idioma, INICIO.clave)}
            </EnlaceNav>
          </li>
        </ul>

        <div className="mt-2 space-y-1">
          {SECCIONES.map((seccion) => {
            const visibles = seccion.enlaces.filter(
              (e) => !e.permiso || usuario.permisos.has(e.permiso),
            );
            if (visibles.length === 0) return null;

            return (
              <GrupoNav
                key={seccion.claveTitulo}
                titulo={t(idioma, seccion.claveTitulo)}
                icono={seccion.icono}
                rutas={visibles.map((e) => e.href)}
              >
                {visibles.map((enlace) => (
                  <li key={enlace.href}>
                    <EnlaceNav href={enlace.href} icono={enlace.icono}>
                      {t(idioma, enlace.clave)}
                    </EnlaceNav>
                  </li>
                ))}
              </GrupoNav>
            );
          })}
        </div>
      </nav>

      <div className="space-y-0.5 border-t border-borde px-2.5 py-3">
        <BotonTema temaActual={tema} idioma={idioma} />
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-red-50 hover:text-red-600 dark:text-zinc-300 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="truncate">{t(idioma, 'cerrarSesion')}</span>
          </button>
        </form>
      </div>
    </>
  );
}
