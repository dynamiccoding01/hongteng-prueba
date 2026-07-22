'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

const esquemaProducto = z.object({
  codigo: z.string().trim().min(1, 'El código es obligatorio'),
  categoria_id: z.coerce.number().int().positive('Seleccione la categoría'),
  descripcion_es: z.string().trim().optional(),
  descripcion_zh: z.string().trim().optional(),
  rango_tallas: z.string().trim().optional(),
  unidad_medida: z.enum(['PAR', 'PIEZA', 'JUEGO']),
  marca: z.string().trim().optional(),
  // Empaque inicial. Un producto sin variante no puede tener stock.
  unidades_por_caja: z.coerce.number().positive('Las unidades por caja deben ser mayores que cero'),
});

/** MAE-01 y MAE-02: producto de fábrica y su primer empaque. */
export async function guardarProducto(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = datos.get('id');

  const analisis = esquemaProducto.safeParse({
    codigo: datos.get('codigo'),
    categoria_id: datos.get('categoria_id'),
    descripcion_es: datos.get('descripcion_es') || undefined,
    descripcion_zh: datos.get('descripcion_zh') || undefined,
    rango_tallas: datos.get('rango_tallas') || undefined,
    unidad_medida: datos.get('unidad_medida'),
    marca: datos.get('marca') || undefined,
    unidades_por_caja: datos.get('unidades_por_caja'),
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { unidades_por_caja, ...producto } = analisis.data;
  const valores = {
    ...producto,
    // Los códigos vienen de fábrica y a veces son numéricos ('80013'): texto siempre.
    codigo: producto.codigo.trim(),
    descripcion_es: producto.descripcion_es ?? null,
    descripcion_zh: producto.descripcion_zh ?? null,
    rango_tallas: producto.rango_tallas ?? null,
    marca: producto.marca ?? null,
  };

  const supabase = await crearClienteServidor();

  if (id) {
    const { error } = await supabase.from('producto').update(valores).eq('id', Number(id));
    if (error) return { error: mensajeError(error, 'producto') };
    revalidatePath('/maestros/productos');
    return { ok: 'Producto actualizado' };
  }

  const { data: creado, error } = await supabase
    .from('producto')
    .insert(valores)
    .select('id')
    .single();

  if (error) return { error: mensajeError(error, 'producto') };

  // El empaque va en la misma operación: sin variante no puede haber stock.
  const { error: errorVariante } = await supabase
    .from('producto_variante')
    .insert({ producto_id: creado.id, unidades_por_caja });

  if (errorVariante) {
    return {
      error: `Producto creado, pero falló el empaque: ${mensajeError(errorVariante, 'empaque')}`,
    };
  }

  revalidatePath('/maestros/productos');
  return { ok: 'Producto creado' };
}

/** MAE-02: un mismo código puede venir en cajas de distinta cantidad. */
export async function agregarVariante(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = z
    .object({
      producto_id: z.coerce.number().int().positive(),
      unidades_por_caja: z.coerce.number().positive('Indique las unidades por caja'),
    })
    .safeParse({
      producto_id: datos.get('producto_id'),
      unidades_por_caja: datos.get('unidades_por_caja'),
    });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('producto_variante').insert(analisis.data);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ese empaque ya existe para este producto' };
    }
    return { error: mensajeError(error, 'empaque') };
  }

  revalidatePath('/maestros/productos');
  return { ok: 'Empaque agregado' };
}
