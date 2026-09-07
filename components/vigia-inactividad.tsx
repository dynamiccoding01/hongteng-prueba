'use client';

import { useEffect, useRef } from 'react';
import { cerrarSesionPorInactividad } from '@/app/login/acciones';
import { CLAVE_ULTIMA_ACTIVIDAD, sesionExpirada } from '@/lib/sesion';

/** Cada cuánto se comprueba el reloj. */
const INTERVALO_REVISION_MS = 30_000;

/**
 * Con qué frecuencia como mucho se anota la actividad.
 *
 * Sin esto un `mousemove` escribiría en `localStorage` decenas de veces por
 * segundo. Anotar una vez cada quince segundos basta: lo que se mide son
 * minutos.
 */
const INTERVALO_ANOTACION_MS = 15_000;

/** Señales de que hay alguien delante. */
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'] as const;

/**
 * Cierra la sesión tras el plazo de `lib/sesion.ts` —quince minutos— sin que
 * nadie toque nada.
 *
 * Es el complemento del middleware, no su sustituto: el middleware solo se
 * entera de que pasó el tiempo cuando llega una petición, así que a quien deja
 * una página abierta y se va a almorzar no lo echaría nadie. Aquí no hay
 * peticiones que esperar.
 *
 * La marca de tiempo vive en `localStorage` y no en el estado del componente
 * para que **las pestañas se pongan de acuerdo**: con dos pestañas abiertas,
 * trabajar en una mantiene viva la otra. Si cada una llevara su propio reloj,
 * la de atrás cerraría la sesión de la de adelante.
 *
 * No renderiza nada.
 */
export function VigiaInactividad() {
  // Evita que dos disparos simultáneos (dos pestañas) cierren sesión dos veces.
  const cerrando = useRef(false);

  useEffect(() => {
    let ultimaAnotacion = 0;

    const anotar = () => {
      const ahora = Date.now();
      if (ahora - ultimaAnotacion < INTERVALO_ANOTACION_MS) return;
      ultimaAnotacion = ahora;
      try {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
      } catch {
        // Modo privado o almacenamiento bloqueado: queda el middleware.
      }
    };

    const leerMarca = (): string | null => {
      try {
        return localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD);
      } catch {
        return null;
      }
    };

    // Al montar se cuenta como actividad: se acaba de cargar una página.
    anotar();

    const revisar = () => {
      if (cerrando.current) return;
      // Una marca ausente aquí es distinta del caso del servidor: significa que
      // este navegador nunca pudo escribirla. Echar a alguien por eso sería un
      // cierre de sesión sin motivo, así que se deja al middleware decidir.
      const marca = leerMarca();
      if (marca === null) return;
      if (!sesionExpirada(marca, Date.now())) return;

      cerrando.current = true;
      void cerrar();
    };

    const cerrar = async () => {
      try {
        localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
        sessionStorage.clear();
      } catch {
        // Da igual: lo que cierra la sesión es la acción de servidor.
      }

      try {
        await cerrarSesionPorInactividad();
      } catch {
        // Aunque falle, la cookie ya caducó y el middleware rebota al login.
      }

      // Navegación dura a propósito: recarga el documento entero y con él se va
      // la caché de rutas de Next, que guarda en memoria las páginas privadas
      // ya visitadas. Con `router.push` esas páginas seguirían en el navegador.
      window.location.replace('/login?expirada=1');
    };

    for (const evento of EVENTOS) {
      window.addEventListener(evento, anotar, { passive: true });
    }

    // Volver a la pestaña es actividad, y además es el momento de comprobar:
    // los temporizadores de una pestaña en segundo plano van muy frenados.
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      revisar();
      anotar();
    };
    document.addEventListener('visibilitychange', alVolver);

    const reloj = window.setInterval(revisar, INTERVALO_REVISION_MS);

    return () => {
      for (const evento of EVENTOS) window.removeEventListener(evento, anotar);
      document.removeEventListener('visibilitychange', alVolver);
      window.clearInterval(reloj);
    };
  }, []);

  return null;
}
