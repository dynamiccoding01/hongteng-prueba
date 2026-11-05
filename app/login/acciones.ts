'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { COOKIE_ULTIMA_ACTIVIDAD, INACTIVIDAD_MAXIMA_MS } from '@/lib/sesion';
import { destinoSeguro } from '@/lib/destino';

/**
 * Arranca el reloj de inactividad.
 *
 * Tiene que hacerse al entrar y no dejarlo al middleware: `sesionExpirada`
 * trata la cookie ausente como sesión caducada, así que sin esto el primer
 * clic después del login rebotaría al propio login.
 */
async function marcarActividad(): Promise<void> {
  const almacen = await cookies();
  almacen.set(COOKIE_ULTIMA_ACTIVIDAD, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INACTIVIDAD_MAXIMA_MS / 1000,
  });
}

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Ingrese su correo').email('Correo no válido'),
  // 72 es el tope de bcrypt, que es lo que usa Supabase Auth: más largo no se
  // compara entero.
  password: z.string().min(1, 'Ingrese su contraseña').max(72, 'Correo o contraseña incorrectos'),
  // FormData.get() devuelve null cuando el input oculto no se renderiza (entrada
  // directa a /login, sin ?destino=). .nullish() acepta string, null y undefined;
  // .optional() rechazaba el null y bloqueaba TODO inicio de sesión directo.
  destino: z.string().nullish(),
});

export interface EstadoLogin {
  error?: string;
}

export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  datos: FormData,
): Promise<EstadoLogin> {
  const analisis = esquemaLogin.safeParse({
    email: datos.get('email'),
    password: datos.get('password'),
    destino: datos.get('destino'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { data: sesion, error } = await supabase.auth.signInWithPassword({
    email: analisis.data.email,
    password: analisis.data.password,
  });

  if (error || !sesion.user) {
    // Mensaje deliberadamente generico: no revela si el correo existe.
    return { error: 'Correo o contraseña incorrectos' };
  }

  /*
   * Desactivar a alguien (`usuario.activo = false`) no toca su cuenta de
   * Supabase Auth, así que la contraseña seguía funcionando. Antes la sesión se
   * abría igual y el layout, al no encontrar un perfil activo, mandaba a
   * `/login`; el middleware, al ver una sesión, devolvía a `/`, y así hasta que
   * el navegador cortaba con «demasiadas redirecciones». Ahora se comprueba
   * aquí, se cierra la sesión recién abierta y se dice por qué.
   */
  const { data: perfil } = await supabase
    .from('usuario')
    .select('activo')
    .eq('id', sesion.user.id)
    .maybeSingle();

  if (!perfil?.activo) {
    await supabase.auth.signOut();
    return {
      error: 'Su cuenta está desactivada. Pídale al administrador del sistema que la reactive.',
    };
  }

  // Queda registrado quien entro y cuando (ADM-02).
  await supabase.rpc('registrar_en_bitacora', {
    p_accion: 'LOGIN',
    p_modulo: 'admin',
    p_descripcion: 'Inicio de sesión',
  });

  /*
   * Antes era un `update usuario ... where email = …` con el cliente de sesión.
   * La RLS solo deja escribir en `usuario` a quien tiene `usuario.editar`, así
   * que para todos los demás el UPDATE se filtraba en silencio y
   * `ultimo_acceso` no se movía nunca. Además comparaba el correo tal como se
   * tecleó, y con una mayúscula tampoco encontraba la fila. La función (0036)
   * marca la fila de quien llama, y solo esa columna.
   */
  const { error: errorAcceso } = await supabase.rpc('fn_registrar_acceso');
  if (errorAcceso) console.error('No se pudo registrar el último acceso:', errorAcceso.message);

  await marcarActividad();

  revalidatePath('/', 'layout');
  // Solo rutas de este sitio: `destino` viene de la URL y cualquiera puede
  // escribirlo (L-01, ver lib/destino.ts).
  redirect(destinoSeguro(analisis.data.destino));
}

export async function cerrarSesion(): Promise<never> {
  const supabase = await crearClienteServidor();

  await supabase.rpc('registrar_en_bitacora', {
    p_accion: 'LOGOUT',
    p_modulo: 'admin',
    p_descripcion: 'Cierre de sesión',
  });

  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_ULTIMA_ACTIVIDAD);
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Cierre de sesión que dispara el vigía del navegador tras 15 minutos quieto.
 *
 * A diferencia de `cerrarSesion`, **no redirige**: quien la llama es un
 * componente de cliente que después navega con `window.location`, de forma que
 * el documento se recarga entero y la caché de rutas de Next —que guarda en
 * memoria las páginas privadas ya visitadas— se va con él. Un `redirect()`
 * desde aquí sería una navegación blanda y esa caché sobreviviría.
 */
export async function cerrarSesionPorInactividad(): Promise<void> {
  const supabase = await crearClienteServidor();

  // Antes de cerrar: después ya no hay sesión con la que escribir.
  await supabase.rpc('registrar_en_bitacora', {
    p_accion: 'LOGOUT',
    p_modulo: 'admin',
    p_descripcion: 'Cierre de sesión por inactividad',
  });

  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_ULTIMA_ACTIVIDAD);
  revalidatePath('/', 'layout');
}
