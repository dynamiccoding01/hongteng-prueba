import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_ULTIMA_ACTIVIDAD, INACTIVIDAD_MAXIMA_MS, sesionExpirada } from '@/lib/sesion';

/** Rutas accesibles sin sesion iniciada. */
const RUTAS_PUBLICAS = ['/login', '/auth'];

/**
 * Refresca la sesion de Supabase en cada peticion y protege las rutas privadas.
 *
 * Es la primera barrera, por comodidad del usuario: la barrera real es RLS en
 * la base de datos. Aunque alguien esquive el middleware, no puede leer ni
 * escribir nada para lo que no tenga permiso.
 *
 * Aqui vive tambien la caducidad por inactividad (ver lib/sesion.ts). Es el
 * unico sitio donde puede vivir de verdad: el vigia del navegador cierra la
 * sesion de quien deja la pantalla abierta, pero solo el servidor puede
 * rechazar a quien vuelve al dia siguiente con la pestana cerrada.
 */
export async function middleware(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesNuevas) {
          for (const { name, value } of cookiesNuevas) {
            request.cookies.set(name, value);
          }
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesNuevas) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() valida el token contra Supabase. No usar getSession() aqui: lee
  // la cookie sin verificarla, y una cookie se puede falsificar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Para volver a donde iba despues de iniciar sesion.
    url.searchParams.set('destino', ruta);
    return NextResponse.redirect(url);
  }

  if (user && ruta === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (user && !esPublica) {
    if (sesionExpirada(request.cookies.get(COOKIE_ULTIMA_ACTIVIDAD)?.value, Date.now())) {
      // Queda el rastro de por que se cerro: sin esto, en la bitacora una
      // sesion caducada y una abandonada se ven igual.
      try {
        await supabase.rpc('registrar_en_bitacora', {
          p_accion: 'LOGOUT',
          p_modulo: 'admin',
          p_descripcion: 'Cierre de sesion por inactividad',
        });
      } catch {
        // Si la bitacora falla, la sesion se cierra igual: la seguridad no
        // depende de que el registro salga bien.
      }

      await supabase.auth.signOut();

      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      url.searchParams.set('expirada', '1');
      const redireccion = NextResponse.redirect(url);

      // signOut() vacio las cookies de sesion sobre `respuesta`, que es una
      // respuesta distinta de la que se devuelve: hay que arrastrarlas o el
      // navegador se queda con el token viejo.
      for (const cookie of respuesta.cookies.getAll()) {
        redireccion.cookies.set(cookie);
      }
      redireccion.cookies.delete(COOKIE_ULTIMA_ACTIVIDAD);
      return redireccion;
    }

    // La prerecarga de Next (<Link> al pasar el raton) tambien pasa por aqui.
    // Cuenta para *comprobar* la caducidad, pero no para renovarla: si no, un
    // menu en pantalla mantendria viva la sesion sin que nadie toque nada.
    const esPrerecarga =
      request.headers.get('next-router-prefetch') === '1' ||
      request.headers.get('purpose') === 'prefetch';

    if (!esPrerecarga) {
      respuesta.cookies.set(COOKIE_ULTIMA_ACTIVIDAD, String(Date.now()), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: INACTIVIDAD_MAXIMA_MS / 1000,
      });
    }
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo excepto archivos estaticos e imagenes.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
