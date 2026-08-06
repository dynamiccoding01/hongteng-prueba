'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Icono, type NombreIcono } from './iconos';

/** Igual criterio que EnlaceNav: '/' solo coincide exacto; el resto por prefijo. */
function coincide(ruta: string, href: string) {
  return href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`);
}

/**
 * Módulo colapsable del menú lateral: un botón con el nombre del módulo que
 * despliega u oculta sus enlaces. Se abre solo cuando la ruta actual pertenece
 * al módulo, para que al navegar el grupo correcto quede visible.
 */
export function GrupoNav({
  titulo,
  icono,
  rutas,
  children,
}: {
  titulo: string;
  icono: NombreIcono;
  rutas: string[];
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const activo = rutas.some((r) => coincide(ruta, r));
  const [abierto, setAbierto] = useState(activo);

  useEffect(() => {
    if (activo) setAbierto(true);
  }, [activo]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 ${
          activo ? 'text-acento' : 'text-zinc-700 dark:text-zinc-200'
        }`}
      >
        <Icono nombre={icono} className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">{titulo}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-400 transition-transform ${
            abierto ? 'rotate-180' : ''
          }`}
        />
      </button>
      {abierto ? <ul className="mt-0.5 space-y-0.5 pl-3">{children}</ul> : null}
    </div>
  );
}
