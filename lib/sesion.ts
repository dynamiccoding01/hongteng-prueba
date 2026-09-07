/**
 * Caducidad de la sesión por inactividad.
 *
 * Supabase renueva el token de acceso solo mientras el refresh token siga
 * vivo, así que por sí sola una sesión no caduca: quien no cierra sesión sigue
 * dentro al día siguiente. Para un sistema que se usa en un mostrador, con el
 * computador compartido, eso es justo lo que no se quiere.
 *
 * La cuenta no la lleva Supabase sino una cookie propia con la marca de tiempo
 * de la última actividad. El middleware la lee en cada petición y la vuelve a
 * escribir; cuando se pasa del plazo, cierra la sesión y manda al login.
 */

/** Quince minutos sin actividad y la sesión se cierra. */
export const INACTIVIDAD_MAXIMA_MS = 15 * 60 * 1000;

/** Cookie con la marca de tiempo (en milisegundos) de la última actividad. */
export const COOKIE_ULTIMA_ACTIVIDAD = 'ultima_actividad';

/** Clave de `localStorage` que sincroniza la actividad entre pestañas. */
export const CLAVE_ULTIMA_ACTIVIDAD = 'hongteng:ultima-actividad';

/**
 * ¿Caducó la sesión?
 *
 * Falla cerrando: una cookie ausente o ilegible cuenta como caducada. Esto
 * importa más de lo que parece, porque es el caso de «lo dejé abierto y volví
 * al día siguiente»: la cookie se emite con `maxAge` de {@link
 * INACTIVIDAD_MAXIMA_MS}, así que pasado el plazo el navegador ya la borró y lo
 * que llega es la ausencia, no una marca vieja. Tratar la ausencia como sesión
 * válida dejaría entrar exactamente al que se quiere echar.
 *
 * Por eso `iniciarSesion` escribe la cookie al entrar: con una sesión legítima
 * siempre existe.
 *
 * Una marca en el futuro (reloj del cliente adelantado, cambio de horario) se
 * considera válida: descontar tiempo por un reloj torcido cerraría sesiones
 * sanas sin explicación.
 */
export function sesionExpirada(marca: string | null | undefined, ahora: number): boolean {
  if (marca === null || marca === undefined || marca === '') return true;

  const ultimaActividad = Number(marca);
  if (!Number.isFinite(ultimaActividad)) return true;

  return ahora - ultimaActividad > INACTIVIDAD_MAXIMA_MS;
}
