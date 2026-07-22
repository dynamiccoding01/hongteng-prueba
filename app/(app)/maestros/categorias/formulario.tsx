'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { guardarCategoria, type EstadoFormulario } from './acciones';

export interface CategoriaEditable {
  id: number;
  codigo: string;
  nombre_es: string;
  nombre_zh: string | null;
  unidad_medida_default: string;
}

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}

export function FormularioCategoria({ categoria }: { categoria?: CategoriaEditable }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(guardarCategoria, {});

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className={
          categoria
            ? 'text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100'
            : 'rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900'
        }
      >
        {categoria ? 'Editar' : 'Nueva categoría'}
      </button>
    );
  }

  return (
    <form action={accion} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {categoria ? <input type="hidden" name="id" value={categoria.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Código</span>
          <input
            name="codigo"
            defaultValue={categoria?.codigo}
            required
            placeholder="NINO"
            className="rounded-md border border-zinc-300 px-3 py-2 uppercase dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nombre</span>
          <input
            name="nombre_es"
            defaultValue={categoria?.nombre_es}
            required
            placeholder="Niño"
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Nombre en chino <span className="text-zinc-400">(opcional)</span>
          </span>
          <input
            name="nombre_zh"
            defaultValue={categoria?.nombre_zh ?? ''}
            placeholder="童鞋"
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Unidad de medida</span>
          <select
            name="unidad_medida_default"
            defaultValue={categoria?.unidad_medida_default ?? 'PAR'}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="PAR">Par (双数) — calzado</option>
            <option value="PIEZA">Pieza (件数) — ropa</option>
            <option value="JUEGO">Juego</option>
          </select>
        </label>
      </div>

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
