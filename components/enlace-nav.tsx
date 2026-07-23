'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Enlace del menú lateral que se resalta cuando coincide con la ruta actual. */
export function EnlaceNav({ href, children }: { href: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const activo = href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`block rounded-md px-2 py-1.5 text-sm transition ${
        activo
          ? 'bg-acento/10 font-medium text-acento'
          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </Link>
  );
}
