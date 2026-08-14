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
 * Datos de un empaque, más allá de su cantidad. Antes había que recorrer tres
 * pantallas para dejarlo completo: la cantidad aquí, el código de barras en
 * /maestros/codigos y el mínimo en /inventario/alertas.
 */
const codigoEmpaque = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9A-Za-z-]+$/, 'Use solo números, letras y guiones')
  .optional()
  .or(z.literal(''));

const esquemaEmpaque = z.object({
  codigo_barras: codigoEmpaque,
  sku_interno: codigoEmpaque,
  stock_minimo: z.coerce
    .number()
    .min(0, 'El mínimo no puede ser negativo')
    .max(99999999, 'Mínimo fuera de rango'),
});

const cantidadEmpaque = z.coerce
  .number()
  .positive('Indique la cantidad de unidades por caja')
  .max(99999999, 'Cantidad por caja fuera de rango');

function valoresEmpaque(datos: z.infer<typeof esquemaEmpaque>) {
  return {
    // Vacío es null y no cadena vacía: las columnas son unique, y dos empaques
    // con '' chocarían entre sí como si compartieran código.
    codigo_barras: datos.codigo_barras?.toUpperCase() || null,
    sku_interno: datos.sku_interno?.toUpperCase() || null,
    stock_minimo: datos.stock_minimo,
  };
}

/** Traduce los rechazos que vienen de la base sobre un empaque. */
function errorEmpaque(error: { code: string; message: string }): string {
  if (error.code === '23505') {
    return 'Ya existe un empaque con esa cantidad, código de barras o SKU';
  }
  return mensajeError(error as Parameters<typeof mensajeError>[0], 'empaque');
}

/**
 * MAE-02: edita un empaque completo.
 *
 * La cantidad solo viaja cuando el empaque no tiene kardex; con movimientos el
 * formulario no la ofrece y la base la rechazaría igual
 * (`tr_variante_cantidad_inmutable`, 0019). Desactivar con existencia también
 * lo bloquea la base (`tr_variante_desactivar`, 0021).
 */
export async function editarEmpaque(
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const cantidadCruda = datos.get('unidades_por_caja');

  const analisis = esquemaEmpaque
    .extend({
      variante_id: z.coerce.number().int().positive(),
      activo: z.enum(['1', '0']),
      unidades_por_caja: cantidadEmpaque.optional(),
    })
    .safeParse({
      variante_id: datos.get('variante_id'),
      codigo_barras: datos.get('codigo_barras') || undefined,
      sku_interno: datos.get('sku_interno') || undefined,
      stock_minimo: datos.get('stock_minimo') || 0,
      activo: datos.get('activo'),
      unidades_por_caja: cantidadCruda || undefined,
    });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { variante_id, unidades_por_caja, activo, ...resto } = analisis.data;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('producto_variante')
    .update({
      ...valoresEmpaque(resto),
      activo: activo === '1',
      // Solo se manda si el formulario la ofreció: así un empaque con kardex
      // no dispara el trigger de inmutabilidad por reenviar el mismo valor.
      ...(unidades_por_caja === undefined ? {} : { unidades_por_caja }),
    })
    .eq('id', variante_id);

  if (error) return { error: errorEmpaque(error) };

  revalidatePath('/maestros/productos');
  revalidatePath('/maestros/codigos');
  revalidatePath('/inventario/alertas');
  return { ok: 'Empaque actualizado' };
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
  const analisis = esquemaEmpaque
    .extend({
      producto_id: z.coerce.number().int().positive(),
      unidades_por_caja: cantidadEmpaque,
    })
    .safeParse({
      producto_id: datos.get('producto_id'),
      unidades_por_caja: datos.get('unidades_por_caja'),
      codigo_barras: datos.get('codigo_barras') || undefined,
      sku_interno: datos.get('sku_interno') || undefined,
      stock_minimo: datos.get('stock_minimo') || 0,
    });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { producto_id, unidades_por_caja, ...resto } = analisis.data;

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from('producto_variante')
    .insert({ producto_id, unidades_por_caja, ...valoresEmpaque(resto) });

  if (error) return { error: errorEmpaque(error) };

  revalidatePath('/maestros/productos');
  revalidatePath('/maestros/codigos');
  revalidatePath('/inventario/alertas');
  return { ok: 'Empaque agregado' };
}
