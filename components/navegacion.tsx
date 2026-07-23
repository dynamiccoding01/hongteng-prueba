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
  /** Permiso necesario para ver el enlace. Sin permiso, no se muestra. */
  permiso?: string;
}

const SECCIONES: { claveTitulo: Parameters<typeof t>[1]; enlaces: Enlace[] }[] = [
  {
    claveTitulo: 'seccionInventario',
    enlaces: [
      { href: '/', clave: 'navResumen' },
      { href: '/articulos', clave: 'navBuscarArticulos', permiso: 'stock.ver' },
      { href: '/inventario/stock', clave: 'navStockPorZona', permiso: 'stock.ver' },
      { href: '/inventario/movimientos', clave: 'navMovimientos', permiso: 'movimiento.ver' },
      { href: '/inventario/kardex', clave: 'navKardex', permiso: 'movimiento.ver' },
      { href: '/inventario/alertas', clave: 'navAlertasStock', permiso: 'stock.ver' },
      { href: '/inventario/traspasos', clave: 'navTraspasos', permiso: 'movimiento.ver' },
      { href: '/inventario/toma', clave: 'navTomaInventario', permiso: 'toma.ver' },
      { href: '/inventario/buscar-codigo', clave: 'navBuscarCodigo', permiso: 'stock.ver' },
    ],
  },
  {
    claveTitulo: 'seccionMaestros',
    enlaces: [
      { href: '/maestros/productos', clave: 'navProductos', permiso: 'producto.ver' },
      { href: '/maestros/categorias', clave: 'navCategorias', permiso: 'categoria.ver' },
      { href: '/maestros/zonas', clave: 'navBodegasZonas', permiso: 'zona.ver' },
      { href: '/maestros/proveedores', clave: 'navProveedores', permiso: 'proveedor.ver' },
      { href: '/maestros/clientes', clave: 'navClientes', permiso: 'cliente.ver' },
      { href: '/maestros/codigos', clave: 'navCodigosBarras', permiso: 'producto.ver' },
    ],
  },
  {
    claveTitulo: 'seccionCompras',
    enlaces: [
      { href: '/compras/importaciones', clave: 'navImportaciones', permiso: 'importacion.ver' },
    ],
  },
  {
    claveTitulo: 'seccionVentas',
    enlaces: [
      { href: '/ventas/notas', clave: 'navNotasVenta', permiso: 'venta.ver' },
      { href: '/ventas/precios', clave: 'navListasPrecios', permiso: 'venta.ver' },
      {
        href: '/ventas/traspasos-aduana',
        clave: 'navTraspasosAduana',
        permiso: 'documento_traspaso.ver',
      },
      { href: '/ventas/vendedores', clave: 'navVendedores', permiso: 'vendedor.ver' },
    ],
  },
  {
    claveTitulo: 'seccionReportes',
    enlaces: [
      { href: '/reportes/estadistica', clave: 'navEstadisticaMensual', permiso: 'reporte.ver' },
      { href: '/reportes/valorizacion', clave: 'navValorizacion', permiso: 'reporte.ver' },
      { href: '/reportes/ventas', clave: 'navVentasPorPeriodo', permiso: 'reporte.ver' },
      { href: '/reportes/comisiones', clave: 'navComisiones', permiso: 'comision.ver' },
    ],
  },
  {
    claveTitulo: 'seccionAdministracion',
    enlaces: [
      { href: '/admin/usuarios', clave: 'navUsuarios', permiso: 'usuario.ver' },
      { href: '/admin/roles', clave: 'navRolesPermisos', permiso: 'rol.editar' },
      { href: '/admin/empresa', clave: 'navEmpresa', permiso: 'empresa.ver' },
      { href: '/ajustes', clave: 'navAjustes' },
      { href: '/bitacora', clave: 'navBitacora' },
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
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-[10px] tracking-widest text-zinc-500 uppercase">HONG TENG LTDA</p>
        <p className="mt-0.5 text-sm font-semibold">{t(idioma, 'subtituloMenu')}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECCIONES.map((seccion) => {
          const visibles = seccion.enlaces.filter(
            (e) => !e.permiso || usuario.permisos.has(e.permiso),
          );
          if (visibles.length === 0) return null;

          return (
            <div key={seccion.claveTitulo} className="mb-5">
              <p className="px-2 pb-1 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                {t(idioma, seccion.claveTitulo)}
              </p>
              <ul>
                {visibles.map((enlace) => (
                  <li key={enlace.href}>
                    <EnlaceNav href={enlace.href}>{t(idioma, enlace.clave)}</EnlaceNav>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
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
