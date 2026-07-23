'use client';

import { createContext, useContext } from 'react';
import type { Idioma } from '@/lib/i18n';

const ContextoIdioma = createContext<Idioma>('es');

/**
 * Sembrado una sola vez desde app/(app)/layout.tsx (Server Component, ya
 * conoce la cookie). Evita que un componente cliente anidado (como
 * FormularioDesplegable) tenga que leer document.cookie por su cuenta: eso
 * renderizaría "es" en el servidor y podría cambiar a "zh" recién al
 * hidratar, un parpadeo visible para el usuario en chino.
 */
export function ProveedorIdioma({
  idioma,
  children,
}: {
  idioma: Idioma;
  children: React.ReactNode;
}) {
  return <ContextoIdioma.Provider value={idioma}>{children}</ContextoIdioma.Provider>;
}

export function useIdioma(): Idioma {
  return useContext(ContextoIdioma);
}
