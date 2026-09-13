import type { Tema } from './preferencias';

/**
 * Aplica el tema al <html> de inmediato, en el navegador.
 *
 * El atributo `data-theme` lo estampa el layout raíz en el servidor, pero una
 * Server Action revalida el árbol sin repintar los atributos de <html>: React
 * no reconcilia el elemento del documento en un refresh suave, así que el
 * cambio de tema solo se veía tras recargar la página entera. Escribirlo aquí
 * da el cambio instantáneo; la cookie que fija `fijarTema` lo deja persistido
 * para la próxima carga.
 *
 * Resuelve «sistema» igual que el script de app/layout.tsx: a claro/oscuro
 * explícito. Así las clases `dark:` (atadas a [data-theme='oscuro']) y los
 * tokens de color de globals.css quedan siempre en el mismo estado, sin que
 * uno responda al media query y el otro no.
 */
export function aplicarTemaEnDocumento(tema: Tema): void {
  if (typeof document === 'undefined') return;
  const efectivo =
    tema === 'sistema'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'oscuro'
        : 'claro'
      : tema;
  document.documentElement.setAttribute('data-theme', efectivo);
}
