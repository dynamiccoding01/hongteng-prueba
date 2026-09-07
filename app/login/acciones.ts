'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { COOKIE_ULTIMA_ACTIVIDAD, INACTIVIDAD_MAXIMA_MS } from '@/lib/sesion';

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
  email: z.string().min(1, 'Ingrese su correo').email('Correo no válido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
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
  const { error } = await supabase.auth.signInWithPassword({
    email: analisis.data.email,
    password: analisis.data.password,
  });

  if (error) {
    // Mensaje deliberadamente generico: no revela si el correo existe.
    return { error: 'Correo o contraseña incorrectos' };
  }

  // Queda registrado quien entro y cuando (ADM-02).
  await supabase.rpc('registrar_en_bitacora', {
    p_accion: 'LOGIN',
    p_modulo: 'admin',
    p_descripcion: 'Inicio de sesión',
  });

  await supabase
    .from('usuario')
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq('email', analisis.data.email);

  await marcarActividad();

  revalidatePath('/', 'layout');
  redirect(
    analisis.data.destino && analisis.data.destino !== '/login' ? analisis.data.destino : '/',
  );
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
