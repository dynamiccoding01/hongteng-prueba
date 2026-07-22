'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

export type AccionFormulario = (
  estado: EstadoFormulario,
  datos: FormData,
) => Promise<EstadoFormulario>;

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}

/**
 * Formulario desplegable para altas y ediciones.
 * Se colapsa a un botón hasta que el usuario lo abre, para que las tablas no
 * queden llenas de campos.
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
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar] = useActionState<EstadoFormulario, FormData>(accion, {});

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className={
          esEdicion
            ? 'text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100'
            : 'rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900'
        }
      >
        {esEdicion ? 'Editar' : etiquetaNuevo}
      </button>
    );
  }

  return (
    <form action={enviar} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>

      {estado.error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{estado.ok}</p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <BotonGuardar />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Cerrar
        </button>
      </div>
    </form>
  );
}

export function Campo({
  etiqueta,
  nombre,
  valor,
  requerido,
  ejemplo,
  tipo = 'text',
  ancho,
}: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  requerido?: boolean;
  ejemplo?: string;
  tipo?: string;
  ancho?: 'completo';
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho === 'completo' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">
        {etiqueta}
        {requerido ? null : <span className="ml-1 text-zinc-400">(opcional)</span>}
      </span>
      <input
        name={nombre}
        type={tipo}
        defaultValue={valor ?? ''}
        required={requerido}
        placeholder={ejemplo}
        className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </label>
  );
}

export function Seleccion({
  etiqueta,
  nombre,
  valor,
  opciones,
  requerido,
}: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  opciones: { valor: string | number; texto: string }[];
  requerido?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <select
        name={nombre}
        defaultValue={valor ?? ''}
        required={requerido}
        className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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
