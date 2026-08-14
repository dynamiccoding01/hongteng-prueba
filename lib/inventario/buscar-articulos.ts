'use server';

import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { ArticuloEncontrado, ExistenciaZona } from './articulo';

/**
 * Buscador de artículos contra la base de datos.
 *
 * Sustituye a la lista precargada que usaban los formularios de inventario y
 * ventas. Aquella traía `.limit(1000)` y sin `order by`: con las 2.528 fichas
 * de BODEGA.xls, más de la mitad del catálogo simplemente no aparecía en el
 * desplegable, sin ningún aviso, y cuáles llegaban no era ni siquiera estable.
 *
 * Aquí el corte se hace en la base sobre el texto buscado, así que el tamaño
 * del catálogo deja de importar.
 *
 * No comprueba un permiso concreto porque lo usan pantallas con permisos
 * distintos (movimiento, traspaso, venta, toma): basta con exigir sesión y
 * dejar que RLS decida qué productos ve cada quien.
 */

/** Cuántos empaques se devuelven como máximo por búsqueda. */
const MAXIMO = 20;

/**
 * PostgREST interpreta comas, paréntesis y puntos como sintaxis de filtro.
 * Un código con esos caracteres cambiaría el significado de la consulta, así
 * que se quitan antes de armarla.
 */
function limpiar(texto: string): string {
  return texto.replace(/[,()."'*\\:]/g, ' ').trim();
}

export async function buscarArticulos(texto: string): Promise<ArticuloEncontrado[]> {
  await requerirUsuario();

  const busqueda = limpiar(texto).slice(0, 60);
  const supabase = await crearClienteServidor();

  // 1. Los productos que coinciden por código o por descripción.
  let consulta = supabase
    .from('producto')
    .select('id, codigo, descripcion_es, unidad:unidad_medida_id(nombre_es)')
    .eq('activo', true)
    .order('codigo')
    .limit(MAXIMO);

  if (busqueda) {
    consulta = consulta.or(`codigo.ilike.*${busqueda}*,descripcion_es.ilike.*${busqueda}*`);
  }

  const { data: productos } = await consulta;
  if (!productos || productos.length === 0) return [];

  // 2. Sus empaques activos.
  const { data: variantes } = await supabase
    .from('producto_variante')
    .select('id, producto_id, unidades_por_caja')
    .in(
      'producto_id',
      productos.map((p) => p.id),
    )
    .eq('activo', true)
    .order('unidades_por_caja');

  if (!variantes || variantes.length === 0) return [];

  // 3. Dónde tiene existencia cada empaque. Acotado a los que se devuelven.
  const { data: existencias } = await supabase
    .from('stock')
    .select(
      'variante_id, cantidad, zona:zona_id(id, codigo, bodega:bodega_id(codigo, nombre, color))',
    )
    .in(
      'variante_id',
      variantes.map((v) => v.id),
    )
    .gt('cantidad', 0);

  const porVariante = new Map<number, ExistenciaZona[]>();
  for (const e of existencias ?? []) {
    const lista = porVariante.get(e.variante_id) ?? [];
    lista.push({
      zonaId: e.zona.id,
      zona: e.zona.codigo,
      bodega: e.zona.bodega?.codigo ?? '—',
      bodegaNombre: e.zona.bodega?.nombre ?? null,
      color: e.zona.bodega?.color ?? 'gris',
      cantidad: Number(e.cantidad),
    });
    porVariante.set(e.variante_id, lista);
  }

  const datosProducto = new Map(productos.map((p) => [p.id, p]));

  return variantes.flatMap((v) => {
    const p = datosProducto.get(v.producto_id);
    if (!p) return [];
    return [
      {
        id: v.id,
        codigo: p.codigo,
        descripcion: p.descripcion_es,
        unidadesPorCaja: Number(v.unidades_por_caja),
        unidad: p.unidad?.nombre_es ?? 'unidades',
        existencias: (porVariante.get(v.id) ?? []).sort((a, b) => b.cantidad - a.cantidad),
      },
    ];
  });
}
