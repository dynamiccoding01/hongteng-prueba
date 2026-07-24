'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Tipo = 'ok' | 'error';

interface Toast {
  id: number;
  mensaje: string;
  tipo: Tipo;
}

/**
 * Avisos flotantes para el resultado de una acción (guardado / error).
 * Reemplazan al texto pequeño dentro del formulario, que se pierde al hacer
 * scroll: el toast aparece fijo arriba a la derecha y se va solo.
 *
 * El contexto trae por defecto una función vacía, así `useToast()` nunca
 * revienta aunque un componente quede fuera del proveedor.
 */
const ContextoToast = createContext<(mensaje: string, tipo: Tipo) => void>(() => {});

export function useToast() {
  return useContext(ContextoToast);
}

let contador = 0;

export function ProveedorToast({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const mostrar = useCallback((mensaje: string, tipo: Tipo) => {
    const id = ++contador;
    setToasts((actuales) => [...actuales, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((actuales) => actuales.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${
              t.tipo === 'ok'
                ? 'border-emerald-200 bg-white text-emerald-800 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300'
                : 'border-red-200 bg-white text-red-800 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300'
            }`}
          >
            {t.tipo === 'ok' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{t.mensaje}</span>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  );
}
