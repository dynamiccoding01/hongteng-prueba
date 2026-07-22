'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaLista = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  moneda_id: z.coerce.number().int().positive('Seleccione la moneda'),
});

/** VEN-04: crea una lista de precios. */
export async function crearLista(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaLista.safeParse({
    nombre: datos.get('nombre'),
    moneda_id: datos.get('moneda_id'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('lista_precio').insert(analisis.data);

  if (error) return { error: mensajeError(error, 'lista de precios') };

  revalidatePath('/ventas/precios');
  return { ok: 'Lista creada' };
}

const esquemaItem = z.object({
  lista_id: z.coerce.number().int().positive(),
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  precio_caja: z.coerce.number().min(0, 'Precio no válido'),
});

/** VEN-04: fija (o actualiza) el precio por caja de un artículo en la lista. */
export async function fijarPrecio(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaItem.safeParse({
    lista_id: datos.get('lista_id'),
    variante_id: datos.get('variante_id'),
    precio_caja: datos.get('precio_caja'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('lista_precio_item')
    .upsert(analisis.data, { onConflict: 'lista_id,variante_id' });

  if (error) return { error: mensajeError(error, 'precio') };

  revalidatePath('/ventas/precios');
  return { ok: 'Precio guardado' };
}

const esquemaAsignacion = z.object({
  cliente_id: z.coerce.number().int().positive(),
  lista_precio_id: z.coerce.number().int().positive().optional(),
});

/** VEN-04: asigna (o quita) la lista de precios de un cliente. */
export async function asignarListaACliente(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaAsignacion.safeParse({
    cliente_id: datos.get('cliente_id'),
    lista_precio_id: datos.get('lista_precio_id') || undefined,
  });

  if (!analisis.success) {
    return { error: 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('cliente')
    .update({ lista_precio_id: analisis.data.lista_precio_id ?? null })
    .eq('id', analisis.data.cliente_id);

  if (error) return { error: mensajeError(error, 'cliente') };

  revalidatePath('/ventas/precios');
  return { ok: 'Lista asignada al cliente' };
}
