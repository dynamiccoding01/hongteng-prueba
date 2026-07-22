import { Suspense } from 'react';
import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Buscador } from '@/components/buscador';

export const metadata = { title: 'Kardex · Inventario' };

const LIMITE = 300;

const TIPOS: Record<string, { texto: string; tono: 'verde' | 'ambar' | 'neutro' }> = {
  ENTRADA: { texto: 'Entrada', tono: 'verde' },
  SALIDA: { texto: 'Salida', tono: 'neutro' },
  AJUSTE_POSITIVO: { texto: 'Ajuste +', tono: 'ambar' },
  AJUSTE_NEGATIVO: { texto: 'Ajuste −', tono: 'ambar' },
  TRASPASO_SALIDA: { texto: 'Traspaso −', tono: 'neutro' },
  TRASPASO_ENTRADA: { texto: 'Traspaso +', tono: 'verde' },
};

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * INV-03: kardex por artículo — historial cronológico de movimientos con el
 * saldo que dejó cada uno en su zona. Se busca por código; si el código tiene
 * varios empaques, se elige la variante.
 */
export default async function Kardex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; variante?: string }>;
}) {
  const { q, variante } = await searchParams;
  await requerirPermiso('movimiento.ver');

  const supabase = await crearClienteServidor();

  // Sin búsqueda no hay consulta: el kardex siempre parte de un artículo.
  if (!q && !variante) {
    return (
      <>
        <Encabezado titulo="Kardex" descripcion="Historial de movimientos por artículo (INV-03)">
          <Suspense fallback={null}>
            <Buscador marcador="Código de artículo…" />
          </Suspense>
        </Encabezado>
        <Vacio>Busque un artículo por código para ver su kardex.</Vacio>
      </>
    );
  }

  let consultaVariantes = supabase
    .from('producto_variante')
    .select('id, unidades_por_caja, producto:producto_id!inner(codigo, descripcion_es)')
    .limit(20);

  consultaVariantes = variante
    ? consultaVariantes.eq('id', Number(variante))
    : consultaVariantes.ilike('producto.codigo', `%${q}%`);

  const { data: variantes, error: errorVariantes } = await consultaVariantes;

  if (errorVariantes) return <Vacio>No se pudo buscar: {errorVariantes.message}</Vacio>;

  // Varias coincidencias: se elige de una lista antes de mostrar movimientos.
  if ((variantes ?? []).length !== 1) {
    return (
      <>
        <Encabezado titulo="Kardex" descripcion="Historial de movimientos por artículo (INV-03)">
          <Suspense fallback={null}>
            <Buscador marcador="Código de artículo…" />
          </Suspense>
        </Encabezado>
        {(variantes ?? []).length === 0 ? (
          <Vacio>
            Ningún artículo coincide con <strong>{q}</strong>.
          </Vacio>
        ) : (
          <ul className="space-y-2">
            {(variantes ?? []).map((v) => (
              <li key={v.id}>
                <Link
                  href={`/inventario/kardex?variante=${v.id}`}
                  className="text-sm underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <code>{v.producto.codigo}</code> — {numero(v.unidades_por_caja)} u/caja
                  {v.producto.descripcion_es ? ` · ${v.producto.descripcion_es}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const v = variantes![0]!;

  const [{ data: movimientos, error }, { data: stock }] = await Promise.all([
    supabase
      .from('movimiento')
      .select(
        'id, tipo, cajas, unidades, saldo_cajas, motivo, fecha, anulado_por, zona:zona_id(codigo), usuario:usuario_id(nombre)',
      )
      .eq('variante_id', v.id)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .limit(LIMITE),
    supabase.from('stock').select('cajas, unidades').eq('variante_id', v.id),
  ]);

  if (error) return <Vacio>No se pudo cargar el kardex: {error.message}</Vacio>;

  const totalCajas = (stock ?? []).reduce((s, f) => s + Number(f.cajas), 0);
  const totalUnidades = (stock ?? []).reduce((s, f) => s + Number(f.unidades), 0);

  return (
    <>
      <Encabezado
        titulo={`Kardex · ${v.producto.codigo}`}
        descripcion={`${numero(v.unidades_por_caja)} u/caja · existencia actual: ${numero(totalCajas)} cajas (${numero(totalUnidades)} unidades)`}
      >
        <Suspense fallback={null}>
          <Buscador marcador="Código de artículo…" />
        </Suspense>
      </Encabezado>

      {(movimientos ?? []).length === 0 ? (
        <Vacio>Este artículo no tiene movimientos registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Zona</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
              <Th numerico>Saldo zona</Th>
              <Th>Usuario</Th>
              <Th>Motivo</Th>
            </tr>
          </thead>
          <tbody>
            {(movimientos ?? []).map((m) => {
              const t = TIPOS[m.tipo] ?? { texto: m.tipo, tono: 'neutro' as const };
              return (
                <tr key={m.id}>
                  <Td tenue>{fecha(m.fecha)}</Td>
                  <Td>
                    <Etiqueta tono={t.tono}>{t.texto}</Etiqueta>
                    {m.anulado_por !== null ? (
                      <span className="ml-1 text-xs text-zinc-500">anula #{m.anulado_por}</span>
                    ) : null}
                  </Td>
                  <Td tenue>{m.zona.codigo}</Td>
                  <Td numerico>{numero(m.cajas)}</Td>
                  <Td numerico tenue>
                    {numero(m.unidades)}
                  </Td>
                  <Td numerico>{numero(m.saldo_cajas)}</Td>
                  <Td tenue>{m.usuario?.nombre ?? '—'}</Td>
                  <Td tenue>{m.motivo ?? '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
