/**
 * Carcasa de las vistas de impresión.
 *
 * Aparte de `(app)` a propósito: estas páginas no llevan menú lateral, ni
 * cabecera, ni proveedores de tema o de avisos. Son documentos, y todo lo que
 * los rodee en pantalla es ruido que además habría que acordarse de esconder
 * al imprimir.
 *
 * El fondo gris con la hoja blanca encima es lo que hace entender de un vistazo
 * que se está mirando papel. Se fija aquí y no con los tokens de tema porque el
 * documento es blanco aunque quien lo imprima tenga el sistema en oscuro.
 */
export default function LayoutImpresion({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-zinc-200 pb-10 print:bg-white print:pb-0">{children}</div>;
}
