'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

const esquemaLogin = z.object({
  email: z.string().min(1, 'Ingrese su correo').email('Correo no válido'),
  password: z.string().min(1, 'Ingrese su contraseña'),
  destino: z.string().optional(),
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
  revalidatePath('/', 'layout');
  redirect('/login');
}
