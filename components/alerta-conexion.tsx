'use client';

import { useEffect, useState } from 'react';

/** Cuánto se queda a la vista el aviso de que la conexión volvió. */
const AVISO_RESTABLECIDA_MS = 4000;

type Estado = 'conectado' | 'sin_conexion' | 'restablecida';

/**
 * Avisa cuando el navegador se queda sin internet.
 *
 * Todo lo que se guarda en el sistema viaja al servidor (Server Actions): sin
 * conexión, el «Guardar» de un formulario falla, y sin este aviso parece una
 * avería del sistema. Peor aún, quien recarga la página para «arreglarlo»
 * pierde lo que tenía escrito en el modal. El aviso dice qué pasa y qué no
 * hacer mientras dura.
 *
 * El `<div class="alerta">` está siempre en el documento y se muestra u oculta
 * con `hidden`: así un lector de pantalla lo anuncia al aparecer (`role="alert"`)
 * sin que React tenga que montarlo en ese momento.
 *
 * El evento `offline` lo dispara el navegador cuando pierde la red. Dice «no
 * hay red», no «el servidor no responde»: con wifi pero sin salida a internet
 * puede no dispararse. Para eso está el error del propio formulario.
 */
export function AlertaConexion() {
  const [estado, setEstado] = useState<Estado>('conectado');

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const alPerderConexion = () => {
      clearTimeout(temporizador);
      setEstado('sin_conexion');
    };

    const alVolverConexion = () => {
      clearTimeout(temporizador);
      setEstado('restablecida');
      temporizador = setTimeout(() => setEstado('conectado'), AVISO_RESTABLECIDA_MS);
    };

    // La página puede haberse cargado ya sin conexión (desde la caché): en ese
    // caso no habrá un evento `offline` que esperar.
    if (!navigator.onLine) setEstado('sin_conexion');

    window.addEventListener('offline', alPerderConexion);
    window.addEventListener('online', alVolverConexion);

    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('offline', alPerderConexion);
      window.removeEventListener('online', alVolverConexion);
    };
  }, []);

  return (
    <div
      className="alerta no-imprimir"
      role="alert"
      data-estado={estado}
      hidden={estado === 'conectado'}
    >
      {estado === 'sin_conexion' ? (
        <span>
          <strong>Sin conexión a internet.</strong> Lo que guarde no llegará al sistema hasta que
          vuelva: no recargue la página para no perder lo que tiene escrito.
        </span>
      ) : (
        <span>
          <strong>Conexión restablecida.</strong> Ya puede volver a guardar.
        </span>
      )}
    </div>
  );
}
