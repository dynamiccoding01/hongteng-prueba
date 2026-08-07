/**
 * Conversión de un rango de fechas elegido en pantalla a los instantes con que
 * se filtra `bitacora.created_at`.
 *
 * `created_at` es `timestamptz`, o sea un instante absoluto; el filtro de la
 * pantalla son días del calendario chileno. Traducir de uno a otro no es
 * cosmético: si se compara contra medianoche UTC, en Chile (UTC-4/-3) se
 * pierden las últimas horas de la tarde del día elegido, que es justo cuando se
 * trabaja en bodega.
 */

export const ZONA = 'America/Santiago';

const DIA_MS = 86_400_000;

/** `YYYY-MM-DD` de un instante, leído en hora de Chile. */
export function comoDia(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(instante);
}

/**
 * Desfase horario de Chile **para ese día**, con formato `-04:00`.
 *
 * Se calcula día a día a propósito: el país cambia de hora dentro del año, así
 * que un desfase fijo desplazaría el filtro una hora medio año.
 */
export function desfase(dia: string): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dia}T12:00:00Z`));

  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-04:00';
  // En un desfase de cero, Intl devuelve 'GMT' a secas.
  return nombre === 'GMT' ? '+00:00' : nombre.replace('GMT', '');
}

/** Instante en que empieza ese día en Chile, en formato ISO con desfase. */
export function inicioDelDia(dia: string): string {
  return `${dia}T00:00:00${desfase(dia)}`;
}

/** El día siguiente a `dia`, en el calendario chileno. */
export function diaSiguiente(dia: string): string {
  return comoDia(new Date(new Date(`${dia}T12:00:00Z`).getTime() + DIA_MS));
}

/** Hace `dias` atrás desde `referencia`, como día del calendario chileno. */
export function diasAtras(referencia: Date, dias: number): string {
  return comoDia(new Date(referencia.getTime() - dias * DIA_MS));
}

/**
 * Límites con los que consultar: `desde` inclusive, `hasta` **exclusivo**.
 * El día final entra completo, cortando al empezar el día siguiente.
 */
export function limites(desde: string, hasta: string): { inicio: string; fin: string } {
  return { inicio: inicioDelDia(desde), fin: inicioDelDia(diaSiguiente(hasta)) };
}
