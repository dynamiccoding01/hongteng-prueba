import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad para todas las respuestas (H-03, REVISION_CRITICA.md).
 *
 * No había ninguna. Lo que cada una cierra:
 *
 * - `frame-ancestors 'none'` / `X-Frame-Options`: sin ellas, cualquier sitio
 *   podía meter el sistema en un `<iframe>` invisible y hacer que un vendedor
 *   con la sesión abierta pulsara «Confirmar venta» creyendo pulsar otra cosa
 *   (clickjacking). Las dos, porque los navegadores viejos solo leen la segunda.
 * - `form-action 'self'` y `base-uri 'self'`: un HTML inyectado no puede mandar
 *   un formulario —con la contraseña del login— a otro dominio ni cambiar la
 *   base de las rutas relativas.
 * - `object-src 'none'`: sin plugins.
 * - `nosniff`: un `.xlsx` exportado no se interpreta como HTML.
 * - `Referrer-Policy`: las URL llevan filtros y `?destino=`; a otros sitios solo
 *   viaja el dominio.
 *
 * No hay `script-src`: Next inyecta scripts en línea para hidratar y el script
 * del tema vive en `app/layout.tsx`. Restringirlos exige un nonce por petición
 * desde el middleware, y una CSP mal puesta deja la aplicación en blanco. Es el
 * siguiente paso, no uno que se dé a ciegas.
 */
const CABECERAS_SEGURIDAD = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Los navegadores la ignoran sobre http, así que no molesta en desarrollo.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No se anuncia la versión de Next: es la primera pregunta de quien busca
  // una vulnerabilidad conocida.
  poweredByHeader: false,
  // No se ignoran errores de tipos ni de lint en el build: si algo falla, el build falla.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS_SEGURIDAD }];
  },
};

export default nextConfig;
