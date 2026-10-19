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

const esquemaEdicion = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  activo: z.enum(['1', '0']),
});

/**
 * VEN-04: renombra una lista o la desactiva.
 *
 * La moneda no se edita: `lista_precio_item.precio_caja` no guarda moneda
 * propia —se lee en la de la lista—, así que cambiarla convertiría 35 dólares
 * en 35 pesos sin tocar una sola fila de precios. Es la misma razón por la que
 * la moneda de una venta se sella en cuanto tiene detalle.
 *
 * Desactivar importa más de lo que parece: con dos listas activas en la misma
 * moneda, `fn_confirmar_importacion` deja de publicar precios y al vender no se
 * sabe cuál aplicar. Sin esta acción, una lista creada por error dejaba el
 * sistema en ese estado para siempre.
 */
export async function editarLista(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaEdicion.safeParse({
    id: datos.get('id'),
    nombre: datos.get('nombre'),
    activo: datos.get('activo'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, nombre, activo } = analisis.data;
  const queda = activo === '1';

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('lista_precio')
    .update({ nombre, activo: queda })
    .eq('id', id);

  if (error) return { error: mensajeError(error, 'lista de precios') };

  revalidatePath('/ventas/precios');
  return { ok: queda ? 'Lista actualizada' : 'Lista desactivada' };
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

/*
 * Aquí vivía `asignarListaACliente`, que asignaba una lista a un cliente.
 * Se retiró con la pantalla: la lista ya no se reparte cliente por cliente,
 * porque era un paso que nadie recordaba y dejaba al cliente nuevo sin
 * precios. Mientras haya una sola lista activa, es la de todos.
 *
 * La columna `cliente.lista_precio_id` sigue en la base y se respeta si tiene
 * valor: los clientes que ya la tenían no cambian de precios. No se borró
 * porque retirar una columna con datos no se deshace, y la decisión de vender
 * también a minoristas puede volver.
 */
