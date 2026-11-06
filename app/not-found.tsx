import Link from 'next/link';

/**
 * Página 404: «Página no existe».
 *
 * Next la muestra en dos casos: una dirección que no corresponde a ninguna
 * ruta, y cualquier `notFound()` del código —por ejemplo
 * `/imprimir/venta/abc`, o una venta que la RLS no deja ver—. Antes salía la
 * página genérica de Next, en inglés y sin forma de volver.
 *
 * Solo la ve quien tiene sesión: sin ella, el middleware manda a `/login` antes
 * de llegar aquí, así que no le confirma a nadie de afuera qué rutas existen.
 *
 * Va fuera de `(app)` a propósito: una ruta que no existe no tiene sección a
 * la que pertenecer, y sin carcasa la página no depende de consultar permisos
 * para pintarse. Por eso tampoco dice «no tiene permiso»: eso es
 * `/sin-permiso`, y confundir los dos manda a pedir accesos que no hacen falta.
 */
export default function PaginaNoExiste() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="text-6xl font-semibold tracking-tight text-tenue" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold">Página no existe</h1>
        <p className="mt-2 text-sm text-tenue">
          La dirección que abrió no corresponde a ninguna pantalla del sistema, o el registro que
          buscaba ya no está.
        </p>
        <p className="mt-1 text-sm text-tenue">
          Revise el enlace, o vuelva al inicio y entre desde el menú.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
