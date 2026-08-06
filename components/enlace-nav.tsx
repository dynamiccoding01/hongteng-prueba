'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icono, type NombreIcono } from './iconos';

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

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
        activo
          ? 'bg-acento/10 font-medium text-acento'
          : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
      }`}
    >
      <Icono nombre={icono} className="size-4 shrink-0" strokeWidth={activo ? 2.25 : 1.75} />
      <span className="truncate">{children}</span>
    </Link>
  );
}
