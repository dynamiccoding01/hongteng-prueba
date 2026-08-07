'use client';

import { useActionState, useEffect, useState } from 'react';
import { createPortal, useFormStatus } from 'react-dom';
import { X } from 'lucide-react';
import { t, type Idioma } from '@/lib/i18n';
import { useIdioma } from './proveedor-idioma';
import { useToast } from './proveedor-toast';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

export type AccionFormulario = (
  estado: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

function BotonGuardar({ idioma }: { idioma: Idioma }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-acento px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t(idioma, 'accGuardando') : t(idioma, 'accGuardar')}
    </button>
  );
}

/**
 * Formulario desplegable para altas y ediciones.
 * Se colapsa a un botón hasta que el usuario lo abre, para que las tablas no
 * queden llenas de campos.
 *
 * `esEdicion` solo cambia el aspecto del botón: enlace discreto dentro de una
 * fila en vez de botón de acción. Con `etiquetaNuevo` vacío el texto es
 * "Editar"; si se pasa una etiqueta, manda esa, para las filas que ofrecen más
 * de una acción.
 */
export function FormularioDesplegable({
  accion,
  etiquetaNuevo,
  esEdicion,
  children,
}: {
  accion: AccionFormulario;
  etiquetaNuevo: string;
  esEdicion?: boolean;
  children: React.ReactNode;
}) {
  const idioma = useIdioma();
  const mostrarToast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [estado, enviar] = useActionState<EstadoFormulario, FormData>(accion, {});

  // createPortal necesita document.body: solo existe en el cliente ya montado.
  useEffect(() => setMontado(true), []);

  // Cada resultado de la acción llega como un objeto nuevo; se avisa una vez.
  // Si guardó bien, además se cierra el panel.
  useEffect(() => {
    if (estado.ok) {
      mostrarToast(estado.ok, 'ok');
      setAbierto(false);
    } else if (estado.error) {
      mostrarToast(estado.error, 'error');
    }
  }, [estado, mostrarToast]);

  // Con el panel abierto: Escape lo cierra y el fondo no hace scroll.
  useEffect(() => {
    if (!abierto) return;
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('keydown', alTecla);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  const titulo = esEdicion && !etiquetaNuevo ? t(idioma, 'accEditar') : etiquetaNuevo;

  const panel =
    abierto && montado
      ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 [animation:aparecer_.15s_ease-out]"
              onClick={() => setAbierto(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={titulo}
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-borde bg-superficie shadow-2xl [animation:aparecer-modal_.15s_ease-out]"
            >
              <div className="flex items-center justify-between border-b border-borde px-6 py-4">
                <h2 className="text-base font-semibold">{titulo}</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label={t(idioma, 'accCerrar')}
                  className="rounded-md p-1 text-tenue hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form action={enviar} className="flex min-h-0 flex-1 flex-col">
                {/*
                 * `content-start` es necesario: sin él, el grid dentro de un
                 * contenedor flexible reparte el alto sobrante entre las filas y
                 * los campos quedan separados por huecos enormes.
                 */}
                <div className="grid content-start gap-x-5 gap-y-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
                  {children}
                </div>
                <div className="flex justify-end gap-2 border-t border-borde px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setAbierto(false)}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
                  >
                    {t(idioma, 'accCerrar')}
                  </button>
                  <BotonGuardar idioma={idioma} />
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className={
          esEdicion
            ? 'text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100'
            : 'rounded-md bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90'
        }
      >
        {titulo}
      </button>
      {panel}
    </>
  );
}

// `user-invalid` y no `invalid`: marca en rojo solo después de que la persona
// interactuó con el campo. Con `invalid` todo obligatorio nace en rojo.
const CLASE_CONTROL =
  'rounded-md border border-zinc-300 px-3 py-2 outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 user-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900';

/**
 * Campo de texto del formulario.
 *
 * Las restricciones (`minimo`, `patron`, `largoMax`…) son ayuda inmediata para
 * quien escribe: el navegador avisa antes de enviar. **No son la validación**:
 * esa es el esquema Zod del `acciones.ts`, que corre en el servidor y no se
 * puede saltar desde el navegador.
 */
export function Campo({
  etiqueta,
  nombre,
  valor,
  requerido,
  ejemplo,
  tipo = 'text',
  ancho,
  minimo,
  maximo,
  paso,
  patron,
  largoMax,
  ayuda,
  autocompletado,
}: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  requerido?: boolean;
  ejemplo?: string;
  tipo?: string;
  ancho?: 'completo';
  minimo?: number;
  maximo?: number;
  paso?: number | 'any';
  patron?: string;
  largoMax?: number;
  /** Se muestra bajo el campo y como mensaje cuando el dato no cumple. */
  ayuda?: string;
  autocompletado?: string;
}) {
  const idioma = useIdioma();
  const esNumero = tipo === 'number';

  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho === 'completo' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">
        {etiqueta}
        {requerido ? null : (
          <span className="ml-1 text-zinc-400">{t(idioma, 'campoOpcional')}</span>
        )}
      </span>
      <input
        name={nombre}
        type={tipo}
        defaultValue={valor ?? ''}
        required={requerido}
        placeholder={ejemplo}
        min={minimo}
        max={maximo}
        // Sin `step`, un input numérico rechaza los decimales.
        step={esNumero ? (paso ?? 'any') : undefined}
        // Teclado numérico en el teléfono, que es donde se hace la toma de inventario.
        inputMode={esNumero ? 'decimal' : undefined}
        pattern={patron}
        maxLength={largoMax}
        title={ayuda}
        autoComplete={autocompletado}
        className={CLASE_CONTROL}
      />
      {ayuda ? <span className="text-xs text-tenue">{ayuda}</span> : null}
    </label>
  );
}

export function Seleccion({
  etiqueta,
  nombre,
  valor,
  opciones,
  requerido,
  ancho,
}: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  opciones: { valor: string | number; texto: string }[];
  requerido?: boolean;
  ancho?: 'completo';
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho === 'completo' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={valor ?? ''}
        required={requerido}
        className={CLASE_CONTROL}
      >
        <option value="">—</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
