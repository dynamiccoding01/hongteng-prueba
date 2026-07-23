import type { Metadata } from 'next';
import './globals.css';
import { obtenerIdioma, obtenerTema } from '@/lib/preferencias';

export const metadata: Metadata = {
  title: 'Sistema de Gestión e Inventario',
  description: 'Control de inventario y bodega — HONG TENG LTDA, ZOFRI Iquique',
};

/**
 * Resuelve "sistema" a claro/oscuro una sola vez, antes del primer pintado,
 * para que no haya parpadeo. Si el usuario ya eligió tema explícito, el
 * servidor ya lo estampó en <html> y este script no hace nada.
 */
const SCRIPT_TEMA = `
  (function () {
    var html = document.documentElement;
    if (html.getAttribute('data-theme')) return;
    var oscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', oscuro ? 'oscuro' : 'claro');
  })();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [tema, idioma] = await Promise.all([obtenerTema(), obtenerIdioma()]);
  const temaExplicito = tema === 'sistema' ? undefined : tema;

  return (
    // suppressHydrationWarning: el script de abajo (o una extension del
    // navegador, p. ej. un "modo oscuro forzado") puede escribir data-theme
    // en <html> antes de que React hidrate. Sin esto, React lo marca como
    // un error de hidratacion aunque el resultado visual sea correcto.
    <html lang={idioma === 'zh' ? 'zh' : 'es'} data-theme={temaExplicito} suppressHydrationWarning>
      <head>
        {temaExplicito ? null : <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
