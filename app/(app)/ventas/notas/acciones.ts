'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaCabecera = z.object({
  cliente_id: z.coerce.number().int().positive('Seleccione el cliente'),
  moneda_id: z.coerce.number().int().positive('Seleccione la moneda'),
  vendedor_id: z.coerce.number().int().positive().optional(),
  tipo_cambio: z.coerce.number().positive('Tipo de cambio no válido').optional(),
  fecha: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

/** VEN-01: crea una nota de venta en estado BORRADOR. */
export async function crearVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaCabecera.safeParse({
    cliente_id: datos.get('cliente_id'),
    moneda_id: datos.get('moneda_id'),
    vendedor_id: datos.get('vendedor_id') || undefined,
    tipo_cambio: datos.get('tipo_cambio') || undefined,
    fecha: datos.get('fecha') || undefined,
    notas: datos.get('notas') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('venta').insert({
    cliente_id: analisis.data.cliente_id,
    moneda_id: analisis.data.moneda_id,
    vendedor_id: analisis.data.vendedor_id ?? null,
    tipo_cambio: analisis.data.tipo_cambio ?? null,
    fecha: analisis.data.fecha || undefined,
    notas: analisis.data.notas ?? null,
  });

  if (error) return { error: mensajeError(error, 'venta') };

  revalidatePath('/ventas/notas');
  return { ok: 'Nota de venta creada como borrador' };
}

const esquemaDetalle = z.object({
  venta_id: z.coerce.number().int().positive(),
  variante_id: z.coerce.number().int().positive('Seleccione el artículo'),
  zona_id: z.coerce.number().int().positive('Seleccione la zona de origen'),
  cajas: z.coerce.number().positive('Las cajas deben ser mayores que cero'),
  precio_caja: z.coerce.number().min(0, 'Precio no válido').optional(),
});

/**
 * VEN-02/04: agrega una línea. Si no se indica precio, se toma de la lista
 * de precios del cliente (cuando la tiene y el artículo está en ella).
 */
export async function agregarDetalleVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaDetalle.safeParse({
    venta_id: datos.get('venta_id'),
    variante_id: datos.get('variante_id'),
    zona_id: datos.get('zona_id'),
    cajas: datos.get('cajas'),
    precio_caja: datos.get('precio_caja') || undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();

  let precio = analisis.data.precio_caja ?? null;
  if (precio === null) {
    const { data: venta } = await supabase
      .from('venta')
      .select('cliente:cliente_id(lista_precio_id)')
      .eq('id', analisis.data.venta_id)
      .single();

    const listaId = venta?.cliente?.lista_precio_id;
    if (listaId) {
      const { data: item } = await supabase
        .from('lista_precio_item')
        .select('precio_caja')
        .eq('lista_id', listaId)
        .eq('variante_id', analisis.data.variante_id)
        .maybeSingle();
      precio = item?.precio_caja ?? null;
    }
  }

  const { error } = await supabase.from('venta_detalle').insert({
    venta_id: analisis.data.venta_id,
    variante_id: analisis.data.variante_id,
    zona_id: analisis.data.zona_id,
    cajas: analisis.data.cajas,
    precio_caja: precio,
  });

  if (error) return { error: mensajeError(error, 'detalle') };

  revalidatePath('/ventas/notas');
  return {
    ok:
      analisis.data.precio_caja === undefined && precio !== null
        ? 'Detalle agregado con el precio de la lista del cliente'
        : 'Detalle agregado',
  };
}

const esquemaConfirmacion = z.object({
  venta_id: z.coerce.number().int().positive(),
});

/** VEN-02: confirma y descuenta stock (todo o nada; el sobregiro falla). */
export async function confirmarVenta(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaConfirmacion.safeParse({ venta_id: datos.get('venta_id') });

  if (!analisis.success) {
    return { error: 'Venta no válida' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('fn_confirmar_venta', {
    p_venta_id: analisis.data.venta_id,
  });

  if (error) return { error: mensajeError(error, 'venta') };

  revalidatePath('/ventas/notas');
  revalidatePath('/inventario/stock');
  revalidatePath('/inventario/movimientos');
  revalidatePath('/articulos');
  return { ok: 'Venta confirmada: stock descontado' };
}
