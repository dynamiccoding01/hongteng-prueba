'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  usuario_id: z.string().trim().uuid('Seleccione el usuario'),
  porcentaje_comision: z.coerce
    .number()
    .min(0, 'El porcentaje no puede ser negativo')
    .max(100, 'El porcentaje no puede superar 100'),
});

/** VEN-05: da de alta (o edita el %) a un vendedor. */
export async function guardarVendedor(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquema.safeParse({
    usuario_id: datos.get('usuario_id'),
    porcentaje_comision: datos.get('porcentaje_comision'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = id
    ? await supabase
        .from('vendedor')
        .update({ porcentaje_comision: analisis.data.porcentaje_comision })
        .eq('id', Number(id))
    : await supabase.from('vendedor').insert(analisis.data);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ese usuario ya es vendedor' };
    }
    return { error: mensajeError(error, 'vendedor') };
  }

  revalidatePath('/ventas/vendedores');
  return { ok: id ? 'Porcentaje actualizado' : 'Vendedor agregado' };
}
