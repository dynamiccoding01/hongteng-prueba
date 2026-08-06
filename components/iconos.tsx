'use client';

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
  Library,
  Package,
  Percent,
  Receipt,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Stamp,
  Tag,
  Tags,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/**
 * Mapa de iconos por nombre. Los componentes de icono (funciones) no se pueden
 * pasar como prop desde un Server Component a un Client Component: React solo
 * admite objetos simples a través de esa frontera. Por eso los componentes de
 * servidor pasan el NOMBRE del icono como texto, y aquí (cliente) se resuelve
 * al componente.
 */
export const ICONOS = {
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
  Library,
  Package,
  Percent,
  Receipt,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Stamp,
  Tag,
  Tags,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Wrench,
} satisfies Record<string, LucideIcon>;

export type NombreIcono = keyof typeof ICONOS;

/** Resuelve un nombre de icono a su componente y lo renderiza. */
export function Icono({ nombre, ...props }: { nombre: NombreIcono } & LucideProps) {
  const Componente = ICONOS[nombre];
  return <Componente {...props} />;
}
