'use client';

import { useState } from 'react';
import { CLASE_CONTROL } from './formulario';
import { numero } from './ui';
import { nombreEnvase, piezas } from '@/lib/inventario/articulo';

/**
 * Cuántos empaques entran o salen. En la base la columna se llama `cajas`; en
 * pantalla se llama **Cantidad**, que es la palabra con la que se cuenta.
 *
 * Debajo se dice siempre en qué se está contando y a cuánto equivale: «10
 * docenas × 8 unidades = 80 unidades». El envase se nombra con la unidad de
 * medida del artículo —docena, caja, par—, y lo de dentro son siempre
 * unidades. Sin esa línea el número de arriba es ambiguo —10 puede ser diez
 * docenas o diez piezas— y el total, que es lo que el cliente pide por
 * teléfono, había que calcularlo de cabeza.
 *
 * Arranca en 1 a propósito. Antes arrancaba vacío con `min` 0,01 —la fracción
 * es legítima, se vende suelto—, y la flecha del navegador cuenta desde ese
 * mínimo: la primera pulsación daba 0,01 y la segunda 1,01, sin pasar nunca por
 * un número entero. Empezando en 1 las flechas cuentan 1, 2, 3, y quien
 * necesite media caja la escribe.
 */
export const CAJAS_POR_DEFECTO = 1;

export function CampoCantidad({
  valorInicial,
  unidadesPorCaja,
  unidad,
  maximo,
  nota,
  alCambiar,
}: {
  /** Las cajas ya guardadas, al corregir una línea. Sin esto arranca en 1. */
  valorInicial?: number;
  /** Cuántas unidades trae cada caja del empaque elegido. */
  unidadesPorCaja: number | null;
  /** En qué se cuenta el artículo: par, pieza, juego. */
  unidad: string | null;
  /** Tope de la zona elegida, cuando la operación descuenta existencia. */
  maximo?: number;
  /** Reemplaza la equivalencia cuando hay algo más urgente que decir. */
  nota?: string;
  /**
   * Avisa la cantidad al formulario que contiene el campo. Lo necesita quien
   * tenga que mostrar algo calculado con ella —el subtotal de una venta— sin
   * esperar a que se envíe.
   */
  alCambiar?: (cajas: number | null) => void;
}) {
  const [texto, setTexto] = useState(
    valorInicial === undefined ? String(CAJAS_POR_DEFECTO) : String(valorInicial),
  );

  const cantidad = texto.trim() === '' ? null : Number(texto);
  const valida = cantidad !== null && Number.isFinite(cantidad) && cantidad > 0;
  const tope = maximo === undefined ? '' : ` · máximo ${numero(maximo)}`;
  const total = valida && unidadesPorCaja !== null ? cantidad * unidadesPorCaja : 0;

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">Cantidad</span>
      <input
        name="cajas"
        type="number"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = e.target.value.trim() === '' ? null : Number(e.target.value);
          alCambiar?.(n !== null && Number.isFinite(n) ? n : null);
        }}
        required
        min={0.01}
        max={maximo}
        // Dos decimales, que es lo que guarda `cajas numeric(14,2)` tanto en
        // ventas como en importaciones. Con `step="any"` se podia escribir
        // 1,005: la base lo redondeaba a 1,01 y el subtotal cobrado dejaba de
        // ser el acordado. El servidor lo rechaza igual; esto lo evita antes.
        step={0.01}
        inputMode="decimal"
        className={CLASE_CONTROL}
      />
      <span className="text-xs text-tenue">
        {nota ??
          (unidadesPorCaja === null
            ? 'Elija el artículo'
            : valida
              ? `${numero(cantidad)} ${nombreEnvase(unidad, cantidad)} × ${numero(unidadesPorCaja)} ${piezas(unidadesPorCaja)} = ${numero(total)} ${piezas(total)}${tope}`
              : `Cada ${nombreEnvase(unidad)} trae ${numero(unidadesPorCaja)} ${piezas(unidadesPorCaja)}${tope}`)}
      </span>
    </label>
  );
}
