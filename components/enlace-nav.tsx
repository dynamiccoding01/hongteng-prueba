'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

/**
 * Los componentes de icono (funciones) no se pueden pasar como prop desde un
 * Server Component a un Client Component: React solo admite objetos simples a
 * través de esa frontera. Por eso `navegacion.tsx` (servidor) pasa el NOMBRE
 * del icono como texto, y aquí (cliente) se resuelve al componente.
 */
const ICONOS = {
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
} satisfies Record<string, LucideIcon>;

export type NombreIcono = keyof typeof ICONOS;

/** Enlace del menú lateral que se resalta cuando coincide con la ruta actual. */
export function EnlaceNav({
  href,
  icono,
  children,
}: {
  href: string;
  icono: NombreIcono;
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const activo = href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
  const Icono = ICONOS[icono];

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
        activo
          ? 'bg-acento/10 font-medium text-acento'
          : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
      }`}
    >
      <Icono className="size-4 shrink-0" strokeWidth={activo ? 2.25 : 1.75} />
      <span className="truncate">{children}</span>
    </Link>
  );
}
