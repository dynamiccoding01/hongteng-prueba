import Link from 'next/link';

export default async function SinPermiso({
  searchParams,
}: {
  searchParams: Promise<{ requerido?: string }>;
}) {
  const { requerido } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Sin permiso</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Su rol no tiene acceso a esta sección.
          {requerido ? (
            <>
              {' '}
              Requiere el permiso <code className="text-xs">{requerido}</code>.
            </>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Solicítelo al administrador del sistema si lo necesita para su trabajo.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-2">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
