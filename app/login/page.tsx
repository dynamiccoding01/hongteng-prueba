import type { Metadata } from 'next';
import { Tarjeta } from '@/components/ui';
import { FormularioLogin } from './formulario-login';

export const metadata: Metadata = { title: 'Ingresar · Sistema de Inventario' };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; expirada?: string }>;
}) {
  const { destino, expirada } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-widest text-zinc-500 uppercase">HONG TENG LTDA</p>
          <h1 className="mt-1 text-xl font-semibold">Sistema de Gestión e Inventario</h1>
          <p className="mt-1 text-sm text-zinc-500">Zona Franca de Iquique</p>
        </div>

        {expirada ? (
          <p
            role="status"
            className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            Su sesión se cerró tras 15 minutos sin actividad. Vuelva a entrar.
          </p>
        ) : null}

        <Tarjeta className="p-6">
          <FormularioLogin destino={destino} />
        </Tarjeta>

        <p className="mt-6 text-center text-xs text-zinc-500">
          ¿No tiene acceso? Solicítelo al administrador del sistema.
        </p>
      </div>
    </main>
  );
}
