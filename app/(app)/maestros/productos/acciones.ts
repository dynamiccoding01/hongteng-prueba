'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { mensajeError, type EstadoFormulario } from '@/lib/errores';

/**
 * Datos del artículo en sí. Las unidades por caja NO están aquí a propósito:
 * son del empaque (producto_variante), no del producto.
 */
const esquemaProducto = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(40, 'El código no puede superar 40 caracteres'),
  categoria_id: z.coerce.number().int().positive('Seleccione la categoría'),
  unidad_medida_id: z.coerce.number().int().positive('Seleccione en qué se cuenta el artículo'),
  // Proveedor habitual del artículo. Opcional: en la planilla del cliente hay
  // códigos sin fábrica identificada.
  proveedor_id: z.coerce.number().int().positive().optional(),
  descripcion_es: z.string().trim().max(200).optional(),
  descripcion_zh: z.string().trim().max(200).optional(),
  rango_tallas: z.string().trim().max(40).optional(),
  marca: z.string().trim().max(60).optional(),
  activo: z.enum(['1', '0']),
});

/**
 * En el alta se pide además el primer empaque: sin él no puede haber stock.
 * El tope es el de la columna en la base de datos, numeric(10,2).
 */
const esquemaAlta = esquemaProducto.extend({
  unidades_por_caja: z.coerce
    .number()
    .positive('Indique cuántas unidades trae cada caja')
    .max(99999999, 'Cantidad por caja fuera de rango'),
});

function leerFormulario(datos: FormData) {
  return {
    codigo: datos.get('codigo'),
    categoria_id: datos.get('categoria_id'),
    unidad_medida_id: datos.get('unidad_medida_id'),
    proveedor_id: datos.get('proveedor_id') || undefined,
    descripcion_es: datos.get('descripcion_es') || undefined,
    descripcion_zh: datos.get('descripcion_zh') || undefined,
    rango_tallas: datos.get('rango_tallas') || undefined,
    marca: datos.get('marca') || undefined,
    activo: datos.get('activo'),
    unidades_por_caja: datos.get('unidades_por_caja'),
  };
}

function aValores(datos: z.infer<typeof esquemaProducto>) {
  return {
    // Los códigos vienen de fábrica y a veces son numéricos ('80013'): texto siempre.
    codigo: datos.codigo.trim(),
    categoria_id: datos.categoria_id,
    unidad_medida_id: datos.unidad_medida_id,
    proveedor_id: datos.proveedor_id ?? null,
    descripcion_es: datos.descripcion_es ?? null,
    descripcion_zh: datos.descripcion_zh ?? null,
    rango_tallas: datos.rango_tallas ?? null,
    marca: datos.marca ?? null,
    activo: datos.activo === '1',
  };
}

/**
 * MAE-01: alta de un artículo con su primer empaque.
 *
 * Crear y editar están separados porque no piden lo mismo: al crear hay que
 * declarar cuántas unidades trae la caja, al editar ese dato ya no se toca
 * (ver `agregarEmpaque`).
 */
export async function crearProducto(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = esquemaAlta.safeParse(leerFormulario(datos));

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { unidades_por_caja, ...producto } = analisis.data;
  const supabase = await crearClienteServidor();

  const { data: creado, error } = await supabase
    .from('producto')
    .insert(aValores(producto))
    .select('id')
    .single();

  if (error) return { error: mensajeError(error, 'producto') };

  // El empaque va en la misma operación: sin variante no puede haber stock.
  const { error: errorEmpaque } = await supabase
    .from('producto_variante')
    .insert({ producto_id: creado.id, unidades_por_caja });

  if (errorEmpaque) {
    return {
      error: `Artículo creado, pero falló el empaque: ${mensajeError(errorEmpaque, 'empaque')}`,
    };
  }

  revalidatePath('/maestros/productos');
  return { ok: 'Artículo creado' };
}

/** MAE-01: edición del artículo. No toca empaques ni existencias. */
export async function editarProducto(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const id = Number(datos.get('id'));
  if (!id) return { error: 'No se pudo identificar el artículo' };

  const analisis = esquemaProducto.safeParse(leerFormulario(datos));

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('producto').update(aValores(analisis.data)).eq('id', id);

  if (error) return { error: mensajeError(error, 'producto') };

  revalidatePath('/maestros/productos');
  return { ok: 'Artículo actualizado' };
}

/**
 * MAE-02: corrige la cantidad de un empaque que todavía no tiene historial.
 *
 * El límite lo pone la base (`tr_variante_cantidad_inmutable`, 0019): con
 * movimientos registrados el cambio se rechaza, porque el factor ya se aplicó
 * y el stock dejaría de cuadrar con el kardex. Aquí solo se traduce el rechazo.
 */
export async function editarEmpaque(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = z
    .object({
      variante_id: z.coerce.number().int().positive(),
      unidades_por_caja: z.coerce
        .number()
        .positive('Indique la cantidad de unidades por caja')
        .max(99999999, 'Cantidad por caja fuera de rango'),
    })
    .safeParse({
      variante_id: datos.get('variante_id'),
      unidades_por_caja: datos.get('unidades_por_caja'),
    });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('producto_variante')
    .update({ unidades_por_caja: analisis.data.unidades_por_caja })
    .eq('id', analisis.data.variante_id);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Este artículo ya tiene otro empaque con esa cantidad' };
    }
    return { error: mensajeError(error, 'empaque') };
  }

  revalidatePath('/maestros/productos');
  revalidatePath('/maestros/codigos');
  return { ok: 'Cantidad actualizada' };
}

/**
 * MAE-02: un mismo código puede llegar en cajas de distinta cantidad.
 *
 * Es un empaque NUEVO, no una corrección del anterior: `unidades_por_caja` es
 * el factor con el que fn_aplicar_movimiento convierte cajas a unidades, así
 * que cambiarlo con movimientos ya registrados desincronizaría el stock.
 */
export async function agregarEmpaque(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const analisis = z
    .object({
      producto_id: z.coerce.number().int().positive(),
      unidades_por_caja: z.coerce
        .number()
        .positive('Indique cuántas unidades trae cada caja')
        .max(99999999, 'Cantidad por caja fuera de rango'),
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
      return { error: 'Este artículo ya tiene un empaque con esa cantidad' };
    }
    return { error: mensajeError(error, 'empaque') };
  }

  revalidatePath('/maestros/productos');
  return { ok: 'Empaque agregado' };
}
