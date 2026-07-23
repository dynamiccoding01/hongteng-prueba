import Link from 'next/link';
import type { UsuarioSesion } from '@/lib/auth';
import { cerrarSesion } from '@/app/login/acciones';

interface Enlace {
  href: string;
  texto: string;
  /** Permiso necesario para ver el enlace. Sin permiso, no se muestra. */
  permiso?: string;
}

const SECCIONES: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Inventario',
    enlaces: [
      { href: '/', texto: 'Resumen' },
      { href: '/articulos', texto: 'Buscar artículos', permiso: 'stock.ver' },
      { href: '/inventario/stock', texto: 'Stock por zona', permiso: 'stock.ver' },
      { href: '/inventario/movimientos', texto: 'Movimientos', permiso: 'movimiento.ver' },
      { href: '/inventario/kardex', texto: 'Kardex', permiso: 'movimiento.ver' },
      { href: '/inventario/alertas', texto: 'Alertas de stock', permiso: 'stock.ver' },
    ],
  },
  {
    titulo: 'Maestros',
    enlaces: [
      { href: '/maestros/productos', texto: 'Productos', permiso: 'producto.ver' },
      { href: '/maestros/categorias', texto: 'Categorías', permiso: 'categoria.ver' },
      { href: '/maestros/zonas', texto: 'Bodegas y zonas', permiso: 'zona.ver' },
      { href: '/maestros/proveedores', texto: 'Proveedores', permiso: 'proveedor.ver' },
      { href: '/maestros/clientes', texto: 'Clientes', permiso: 'cliente.ver' },
    ],
  },
  {
    titulo: 'Compras',
    enlaces: [
      { href: '/compras/importaciones', texto: 'Importaciones', permiso: 'importacion.ver' },
    ],
  },
  {
    titulo: 'Ventas',
    enlaces: [
      { href: '/ventas/notas', texto: 'Notas de venta', permiso: 'venta.ver' },
      { href: '/ventas/precios', texto: 'Listas de precios', permiso: 'venta.ver' },
    ],
  },
  {
    titulo: 'Reportes',
    enlaces: [
      { href: '/reportes/estadistica', texto: 'Estadística mensual', permiso: 'reporte.ver' },
      { href: '/reportes/valorizacion', texto: 'Valorización', permiso: 'reporte.ver' },
      { href: '/reportes/ventas', texto: 'Ventas por período', permiso: 'reporte.ver' },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { href: '/admin/usuarios', texto: 'Usuarios', permiso: 'usuario.ver' },
      { href: '/admin/roles', texto: 'Roles y permisos', permiso: 'rol.editar' },
      { href: '/bitacora', texto: 'Bitácora' },
    ],
  },
];

export function Navegacion({ usuario }: { usuario: UsuarioSesion }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-[10px] tracking-widest text-zinc-500 uppercase">HONG TENG LTDA</p>
        <p className="mt-0.5 text-sm font-semibold">Inventario</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECCIONES.map((seccion) => {
          const visibles = seccion.enlaces.filter(
            (e) => !e.permiso || usuario.permisos.has(e.permiso),
          );
          if (visibles.length === 0) return null;

          return (
            <div key={seccion.titulo} className="mb-5">
              <p className="px-2 pb-1 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                {seccion.titulo}
              </p>
              <ul>
                {visibles.map((enlace) => (
                  <li key={enlace.href}>
                    <Link
                      href={enlace.href}
                      className="block rounded-md px-2 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {enlace.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="truncate text-sm font-medium">{usuario.nombre}</p>
        <p className="truncate text-xs text-zinc-500">{usuario.rol}</p>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="mt-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
