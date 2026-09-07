'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { iniciarSesion, type EstadoLogin } from './acciones';

/** Mismo aspecto para los dos campos del formulario. */
const CLASE_CAMPO =
  'w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900';

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-md bg-acento px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function FormularioLogin({ destino }: { destino?: string }) {
  const [estado, accion] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  const [verClave, setVerClave] = useState(false);

  return (
    <form action={accion} className="flex flex-col gap-4">
      {destino ? <input type="hidden" name="destino" value={destino} /> : null}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={CLASE_CAMPO}
        />
      </label>

      {/*
        La etiqueta va con `htmlFor` en vez de envolver al campo: dentro de un
        `<label>`, el clic en el botón del ojo se reenviaría también al input.
      */}
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="password" className="font-medium">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={verClave ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className={`${CLASE_CAMPO} pr-10`}
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
            aria-pressed={verClave}
            // `tabIndex={-1}` a propósito: con teclado se pasa de la contraseña
            // a «Entrar», que es lo que se quiere hacer.
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {verClave ? (
              <EyeOff className="size-4" strokeWidth={1.75} />
            ) : (
              <Eye className="size-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {estado.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
