import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Tabla, Td, Th, Vacio, numero } from '@/components/ui';

export const metadata = { title: 'Resumen · Inventario' };

/** REP-01: resumen de existencias por categoría (equivalente a la hoja 汇总). */
export default async function Resumen() {
  const usuario = await requerirUsuario();
  const supabase = await crearClienteServidor();

  const { data: categorias } = await supabase
    .from('v_resumen_categoria')
    .select('*')
    .order('categoria');

  const totalCajas = (categorias ?? []).reduce((s, c) => s + Number(c.cajas ?? 0), 0);
  const totalUnidades = (categorias ?? []).reduce((s, c) => s + Number(c.unidades ?? 0), 0);
  const totalArticulos = (categorias ?? []).reduce((s, c) => s + Number(c.articulos ?? 0), 0);

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion="Existencias por categoría"
      />

      {totalArticulos === 0 ? (
        <Vacio>
          Todavía no hay artículos cargados.
          <br />
          El catálogo se poblará al migrar <code>BODEGA.xls</code>.
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Categoría</Th>
              <Th numerico>Artículos</Th>
              <Th numerico>Cajas</Th>
              <Th numerico>Unidades</Th>
            </tr>
          </thead>
          <tbody>
            {(categorias ?? []).map((c) => (
              <tr key={c.categoria_id}>
                <Td>
                  {c.categoria}
                  {c.nombre_zh ? (
                    <span className="ml-2 text-xs text-zinc-500">{c.nombre_zh}</span>
                  ) : null}
                </Td>
                <Td numerico>{numero(c.articulos)}</Td>
                <Td numerico>{numero(c.cajas)}</Td>
                <Td numerico>{numero(c.unidades)}</Td>
              </tr>
            ))}
            <tr className="font-medium">
              <Td>Total</Td>
              <Td numerico>{numero(totalArticulos)}</Td>
              <Td numerico>{numero(totalCajas)}</Td>
              <Td numerico>{numero(totalUnidades)}</Td>
            </tr>
          </tbody>
        </Tabla>
      )}
    </>
  );
}
