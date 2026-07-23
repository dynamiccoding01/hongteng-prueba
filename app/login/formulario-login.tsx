'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { iniciarSesion, type EstadoLogin } from './acciones';

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
          className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

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
