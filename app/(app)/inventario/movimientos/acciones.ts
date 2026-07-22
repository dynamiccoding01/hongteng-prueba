'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { obtenerUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquema = z.object({
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_id: z.coerce.number().int().positive('Seleccione la zona'),
  tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'], {
    message: 'Seleccione el tipo de movimiento',
  }),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  motivo: z.string().trim().optional(),
});

/**
 * INV-02: registra una entrada, salida o ajuste.
 * Las unidades y el saldo los calcula el trigger fn_aplicar_movimiento en la
 * base de datos (INV-04); aquí solo se inserta la fila del kardex.
 */
export async function registrarMovimiento(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquema.safeParse({
    variante_id: datos.get('variante_id'),
    zona_id: datos.get('zona_id'),
    tipo: datos.get('tipo'),
    cajas: datos.get('cajas'),
    motivo: datos.get('motivo') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const esAjuste = analisis.data.tipo.startsWith('AJUSTE');
  if (esAjuste && !analisis.data.motivo) {
    return { error: 'Un ajuste siempre lleva motivo: es la justificación ante el descuadre' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('movimiento').insert({
    variante_id: analisis.data.variante_id,
    zona_id: analisis.data.zona_id,
    tipo: analisis.data.tipo,
    cajas: analisis.data.cajas,
    documento_tipo: esAjuste ? 'AJUSTE' : null,
    motivo: analisis.data.motivo ?? null,
  });

  if (error) return { error: mensajeError(error, 'movimiento') };

  revalidatePath('/inventario/movimientos');
  revalidatePath('/inventario/stock');
  revalidatePath('/articulos');
  return { ok: 'Movimiento registrado' };
}

const esquemaAnulacion = z.object({
  movimiento_id: z.coerce.number().int().positive(),
  motivo: z.string().trim().min(1, 'Indique el motivo de la anulación'),
});

/** INV-02: anula registrando el movimiento inverso (el kardex nunca se borra). */
export async function anularMovimiento(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const usuario = await obtenerUsuario();
  if (!usuario?.permisos.has('movimiento.anular')) {
    return { error: 'No tiene permiso para anular movimientos' };
  }

  const analisis = esquemaAnulacion.safeParse({
    movimiento_id: datos.get('movimiento_id'),
    motivo: datos.get('motivo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_anular_movimiento', {
    p_movimiento_id: analisis.data.movimiento_id,
    p_motivo: analisis.data.motivo,
  });

  if (error) return { error: mensajeError(error, 'movimiento') };

  revalidatePath('/inventario/movimientos');
  revalidatePath('/inventario/stock');
  revalidatePath('/articulos');
  return { ok: 'Movimiento anulado con su inverso' };
}
