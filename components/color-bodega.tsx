import { estiloBodega } from '@/lib/colores-bodega';

/**
 * Piezas de interfaz del color de bodega (MAE-04).
 *
 * El color de una bodega no se elige: lo asigna la base al crearla y no se
 * edita (0017_bodega_color_automatico.sql). Aquí solo se pinta, y se usa para
 * elegir bodega al dar de alta una zona.
 *
 * `SelectorBodega` es un Server Component a propósito: un grupo de `radio`
 * dentro de su `label`, resaltado con `peer-checked:`. No hacen falta ni estado
 * ni JavaScript, y el `required` del navegador ya obliga a elegir uno.
 *
 * Las clases de color vienen enteras de `lib/colores-bodega.ts`; aquí solo se
 * componen con el grosor (`ring-2`, `border-l-4`), que sí es fijo.
 */

/** Insignia de la bodega, para las tablas. */
export function DistintivoBodega({
  codigo,
  color,
  titulo,
}: {
  codigo: string;
  color: string | null | undefined;
  titulo?: string | null;
}) {
  const estilo = estiloBodega(color);
  return (
    <span
      title={titulo ?? undefined}
      className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${estilo.distintivo}`}
    >
      {codigo}
    </span>
  );
}

/** Círculo del color de la bodega, donde no cabe la insignia completa. */
export function PuntoBodega({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full ${estiloBodega(color).punto}`}
    />
  );
}

/**
 * Elección de bodega al crear o editar una zona.
 *
 * Con dos o tres bodegas, un desplegable esconde justo lo que hay que ver. Aquí
 * están todas a la vista y cada una con su color, que es el mismo que después
 * aparece en la tabla de zonas.
 */
export function SelectorBodega({
  nombre,
  valor,
  bodegas,
  requerido,
}: {
  nombre: string;
  valor?: number | null;
  bodegas: { id: number; codigo: string; nombre: string; color: string }[];
  requerido?: boolean;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 text-sm font-medium">Bodega</legend>
      <div className="flex flex-wrap gap-2">
        {bodegas.map((b) => {
          const estilo = estiloBodega(b.color);
          return (
            <label key={b.id} className="cursor-pointer">
              <input
                type="radio"
                name={nombre}
                value={b.id}
                defaultChecked={b.id === valor}
                required={requerido}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ring-offset-2 ring-offset-superficie peer-checked:ring-2 peer-focus-visible:ring-2 ${estilo.distintivo} ${estilo.anillo}`}
              >
                <span className="font-semibold">{b.codigo}</span>
                <span className="opacity-80">{b.nombre}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
