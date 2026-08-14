'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaTipoCambio = z.object({
  fecha: z.string().trim().min(1, 'La fecha es obligatoria'),
  valor: z.coerce.number().positive('El valor debe ser mayor que cero'),
  fuente: z.string().trim().optional(),
});

/**
 * Carga o corrige el tipo de cambio del dólar de una fecha.
 *
 * La moneda no se pide: solo se lleva el dólar. Es la única de la que el
 * sistema sabe convertir —los precios se deciden en dólares y las ventas en
 * pesos se calculan desde ahí—, así que ofrecer un selector con las cinco del
 * maestro sería invitar a cargar un dato que nadie va a usar.
 *
 * Corregir un valor **no** cambia ningún documento ya emitido: cada venta e
 * importación se quedó con el tipo de cambio que regía el día que se creó
 * (`fn_documento_tipo_cambio`). Esto solo manda sobre los documentos nuevos.
 */
export async function guardarTipoCambio(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquemaTipoCambio.safeParse({
    fecha: datos.get('fecha'),
    valor: datos.get('valor'),
    fuente: datos.get('fuente') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();

  const { data: usd } = await supabase
    .from('moneda')
    .select('id')
    .eq('codigo', 'USD')
    .maybeSingle();

  if (!usd) return { error: 'Falta la moneda USD en el maestro de monedas' };

  const valores = {
    moneda_id: usd.id,
    fecha: analisis.data.fecha,
    valor: analisis.data.valor,
    fuente: analisis.data.fuente ?? null,
  };

  const { error } = id
    ? await supabase.from('tipo_cambio').update(valores).eq('id', Number(id))
    : await supabase.from('tipo_cambio').insert(valores);

  if (error) {
    // `tipo_cambio_uk` es (moneda_id, fecha): hay uno por día y no dos.
    if (error.code === '23505') {
      return {
        error: `Ya hay un tipo de cambio cargado para esa fecha. Corrija el que está en la lista en vez de agregar otro.`,
      };
    }
    return { error: mensajeError(error, 'tipo de cambio') };
  }

  revalidatePath('/maestros/tipo-cambio');
  // De aquí salen el precio en pesos de las ventas nuevas y la valorización.
  revalidatePath('/ventas/notas');
  revalidatePath('/compras/importaciones');
  revalidatePath('/reportes/valorizacion');

  return {
    ok: id
      ? 'Tipo de cambio corregido. Los documentos ya emitidos conservan el suyo'
      : 'Tipo de cambio cargado',
  };
}
