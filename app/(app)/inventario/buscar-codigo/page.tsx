import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Tarjeta, Td, Th, Vacio, numero } from '@/components/ui';
import { BuscadorCodigo } from '@/components/buscador-codigo';

export const metadata = { title: 'Buscar por código · Inventario' };

/**
 * INV-08: lectura rápida con lector de código de barras/QR. Busca primero por
 * codigo_barras/sku_interno del empaque; si no hay coincidencia, cae al
 * código del artículo impreso (muchos códigos escaneados son ese mismo dato).
 */
export default async function BuscarCodigo({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; variante?: string }>;
}) {
  const { codigo, variante } = await searchParams;
  await requerirPermiso('stock.ver');

  const supabase = await crearClienteServidor();

  if (!codigo && !variante) {
    return (
      <>
        <Encabezado
          titulo="Buscar por código"
          descripcion="Lectura rápida con lector de código de barras o QR (INV-08)"
        >
          <BuscadorCodigo />
        </Encabezado>
        <Vacio>Escanee o escriba un código para ver el artículo y su stock.</Vacio>
      </>
    );
  }

  let variantes: {
    id: number;
    unidades_por_caja: number;
    producto: { codigo: string; descripcion_es: string | null };
  }[] = [];

  if (variante) {
    const { data } = await supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id(codigo, descripcion_es)')
      .eq('id', Number(variante))
      .limit(1);
    variantes = data ?? [];
  } else {
    const { data: porEmpaque } = await supabase
      .from('producto_variante')
      .select('id, unidades_por_caja, producto:producto_id(codigo, descripcion_es)')
      .or(`codigo_barras.eq.${codigo},sku_interno.eq.${codigo}`)
      .limit(5);

    variantes = porEmpaque ?? [];

    if (variantes.length === 0) {
      const { data: porArticulo } = await supabase
        .from('producto_variante')
        .select('id, unidades_por_caja, producto:producto_id!inner(codigo, descripcion_es)')
        .ilike('producto.codigo', codigo!)
        .limit(5);
      variantes = porArticulo ?? [];
    }
  }

  if (variantes.length === 0) {
    return (
      <>
        <Encabezado
          titulo="Buscar por código"
          descripcion="Lectura rápida con lector de código de barras o QR (INV-08)"
        >
          <BuscadorCodigo />
        </Encabezado>
        <Vacio>
          Ningún artículo tiene el código <strong>{codigo ?? variante}</strong> asignado.
        </Vacio>
      </>
    );
  }

  if (variantes.length > 1) {
    return (
      <>
        <Encabezado
          titulo="Buscar por código"
          descripcion="Lectura rápida con lector de código de barras o QR (INV-08)"
        >
          <BuscadorCodigo />
        </Encabezado>
        <p className="mb-3 text-sm text-zinc-500">
          Varios empaques coinciden con <strong>{codigo}</strong>:
        </p>
        <ul className="space-y-2">
          {variantes.map((v) => (
            <li key={v.id}>
              <Link
                href={`/inventario/buscar-codigo?variante=${v.id}`}
                className="text-sm underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <code>{v.producto.codigo}</code> — {numero(v.unidades_por_caja)} u/caja
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const v = variantes[0]!;

  const { data: stock } = await supabase
    .from('stock')
    .select('cajas, unidades, zona:zona_id(codigo, bodega:bodega_id(codigo))')
    .eq('variante_id', v.id)
    .gt('cajas', 0);

  const totalCajas = (stock ?? []).reduce((s, f) => s + Number(f.cajas), 0);
  const totalUnidades = (stock ?? []).reduce((s, f) => s + Number(f.unidades), 0);

  return (
    <>
      <Encabezado
        titulo="Buscar por código"
        descripcion="Lectura rápida con lector de código de barras o QR (INV-08)"
      >
        <BuscadorCodigo />
      </Encabezado>

      <Tarjeta className="mb-6">
        <p className="text-lg font-semibold">
          <code>{v.producto.codigo}</code>
        </p>
        {v.producto.descripcion_es ? (
          <p className="text-sm text-zinc-500">{v.producto.descripcion_es}</p>
        ) : null}
        <p className="mt-2 text-sm text-zinc-500">
          {numero(v.unidades_por_caja)} u/caja · existencia total: {numero(totalCajas)} cajas (
          {numero(totalUnidades)} unidades)
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <Link
            href={`/inventario/kardex?variante=${v.id}`}
            className="underline underline-offset-2"
          >
            Ver kardex
          </Link>
          <Link href={`/inventario/movimientos`} className="underline underline-offset-2">
            Registrar movimiento
          </Link>
        </div>
      </Tarjeta>

      {(stock ?? []).length === 0 ? (
        <Vacio>Este artículo no tiene existencia en ninguna zona.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Bodega</Th>
              <Th>Zona</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
            </tr>
          </thead>
          <tbody>
            {(stock ?? []).map((f, i) => (
              <tr key={i}>
                <Td tenue>{f.zona.bodega?.codigo ?? '—'}</Td>
                <Td>
                  <code className="text-xs">{f.zona.codigo}</code>
                </Td>
                <Td numerico>{numero(f.cajas)}</Td>
                <Td numerico tenue>
                  {numero(f.unidades)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
