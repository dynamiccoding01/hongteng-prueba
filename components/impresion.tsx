import { estiloBodega } from '@/lib/colores-bodega';

/**
 * Piezas de un documento impreso.
 *
 * Ninguna usa los tokens de tema (`bg-superficie`, `text-tenue`) ni el variante
 * `dark:`. Una hoja que va a papel es negra sobre blanco siempre, y el tema
 * oscuro se aplica desde `<html>`, así que heredarlo aquí sacaría la nota de
 * venta en blanco sobre negro. Los colores van escritos a mano y en claro.
 */

/** Datos de cabecera, tal como están en la tabla `empresa`. */
export interface Empresa {
  razon_social: string;
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
}

/**
 * Una copia = una hoja.
 *
 * En pantalla se ve como una página con sombra sobre fondo gris, para que se
 * entienda de un vistazo que son cuatro documentos y no una lista larga. Al
 * imprimir, `.hoja` fuerza el salto de página (ver `@media print`).
 *
 * `data-copia` va en este mismo elemento y no en un envoltorio: la barra de
 * impresión oculta las copias con `.hoja[data-copia="x"]`, y ocultar un padre
 * dejaría dentro una `.hoja` que sigue pidiendo su salto de página.
 */
export function Hoja({ copia, children }: { copia: string; children: React.ReactNode }) {
  return (
    <section
      data-copia={copia}
      className="hoja mx-auto mb-6 w-[216mm] bg-white p-[12mm] text-zinc-900 shadow-lg print:shadow-none"
    >
      {children}
    </section>
  );
}

/**
 * Encabezado: la empresa a la izquierda, el documento a la derecha.
 *
 * Los campos vacíos de `empresa` no dejan hueco ni imprimen un rótulo suelto;
 * simplemente no salen. Hoy el RUT y el teléfono están sin cargar, y una nota
 * que diga «RUT:» seguido de nada se ve peor que una que no lo mencione.
 */
export function EncabezadoDocumento({
  empresa,
  documento,
  copia,
  folio,
  preliminar,
  fecha,
}: {
  empresa: Empresa;
  documento: string;
  copia: string;
  folio: string | null;
  preliminar: boolean;
  fecha: string;
}) {
  return (
    <header className="sin-partir mb-4 border-b-2 border-zinc-900 pb-3">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xl leading-tight font-bold tracking-tight">{empresa.razon_social}</p>
          {empresa.giro ? <p className="text-[11px] text-zinc-700">{empresa.giro}</p> : null}
          <p className="mt-1 text-[11px] leading-snug text-zinc-700">
            {[empresa.direccion, empresa.ciudad].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[11px] leading-snug text-zinc-700">
            {[
              empresa.rut ? `RUT ${empresa.rut}` : null,
              empresa.telefono ? `Tel. ${empresa.telefono}` : null,
              empresa.email,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg leading-tight font-bold">{documento}</p>
          <p className="text-[11px] font-semibold tracking-widest text-zinc-600 uppercase">
            {copia}
          </p>
          <p className="mt-1 font-mono text-base font-bold">
            {folio ? `N° ${folio}` : 'SIN FOLIO'}
          </p>
          <p className="text-[11px] text-zinc-700">{fecha}</p>
        </div>
      </div>

      {/*
       * El sello de borrador. Va como banda y no como marca de agua diagonal a
       * propósito: la marca de agua se pierde al fotocopiar y en impresoras que
       * ahorran tinta, y este aviso tiene que sobrevivir a las dos cosas.
       */}
      {preliminar ? (
        <p className="mt-2 border-2 border-zinc-900 bg-zinc-900 px-2 py-1 text-center text-[11px] font-bold tracking-widest text-white uppercase">
          Preliminar · la venta aún no está confirmada y el stock no se ha descontado
        </p>
      ) : null}
    </header>
  );
}

/** Rótulo con su valor, para los recuadros de cliente y de transporte. */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <p className="text-[11px] leading-relaxed">
      <span className="text-zinc-600">{etiqueta}: </span>
      <span className="font-medium">{valor?.trim() ? valor : '—'}</span>
    </p>
  );
}

/**
 * Recuadro rotulado y vacío, para lo que se llena a mano.
 *
 * Chofer, patente, RUT, total de bultos y el régimen aduanero no están en el
 * sistema: se anotan en el momento del despacho, con el camión en la puerta.
 * Salen impresos como líneas para escribir, igual que en el talonario.
 */
export function ParaLlenar({
  etiqueta,
  ancho = 'normal',
}: {
  etiqueta: string;
  ancho?: 'normal' | 'ancho';
}) {
  return (
    <div className={ancho === 'ancho' ? 'col-span-2' : ''}>
      <p className="text-[9px] tracking-wide text-zinc-600 uppercase">{etiqueta}</p>
      <div className="mt-3 border-b border-zinc-500" />
    </div>
  );
}

/** Insignia de bodega para papel: color de fondo y el código siempre escrito. */
export function BodegaImpresa({ codigo, color }: { codigo: string; color: string | null }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-px font-mono text-[10px] font-bold ${estiloBodega(color).impreso}`}
    >
      {codigo}
    </span>
  );
}

/** Encabezado de columna de la tabla del detalle. */
export function Th({
  children,
  numerico,
  ancho,
}: {
  children?: React.ReactNode;
  numerico?: boolean;
  ancho?: string;
}) {
  return (
    <th
      style={ancho ? { width: ancho } : undefined}
      className={`border border-zinc-400 bg-zinc-100 px-1.5 py-1 text-[10px] font-bold tracking-wide uppercase ${
        numerico ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

/** Celda de la tabla del detalle. */
export function Td({
  children,
  numerico,
  fuerte,
  columnas,
}: {
  children?: React.ReactNode;
  numerico?: boolean;
  fuerte?: boolean;
  columnas?: number;
}) {
  return (
    <td
      colSpan={columnas}
      className={`border border-zinc-400 px-1.5 py-1 align-top text-[11px] ${
        numerico ? 'text-right tabular-nums' : ''
      } ${fuerte ? 'font-semibold' : ''}`}
    >
      {children}
    </td>
  );
}

/** Línea de firma al pie del documento. */
export function Firma({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="text-center">
      <div className="mt-10 border-t border-zinc-500" />
      <p className="mt-1 text-[10px] tracking-wide text-zinc-600 uppercase">{etiqueta}</p>
    </div>
  );
}
