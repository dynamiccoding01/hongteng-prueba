import type { Metadata } from 'next';
import { Tarjeta } from '@/components/ui';
import { FormularioLogin } from './formulario-login';

export const metadata: Metadata = { title: 'Ingresar · Sistema de Inventario' };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-widest text-zinc-500 uppercase">HONG TENG LTDA</p>
          <h1 className="mt-1 text-xl font-semibold">Sistema de Gestión e Inventario</h1>
          <p className="mt-1 text-sm text-zinc-500">Zona Franca de Iquique</p>
        </div>

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
