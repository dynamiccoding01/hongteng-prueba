export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <p className="text-sm tracking-widest text-zinc-500 uppercase">HONG TENG LTDA</p>
        <h1 className="mt-1 text-3xl font-semibold">Sistema de Gestión e Inventario</h1>
        <p className="mt-2 text-zinc-500">Zona Franca de Iquique — Chile</p>
      </div>

      <div className="rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <p className="font-medium">Sprint 0 — entorno base</p>
        <ul className="mt-3 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>
            • Esquema de base de datos versionado en <code>supabase/migrations</code>
          </li>
          <li>• Seguridad usuario → rol → permiso con RLS</li>
          <li>
            • Lector y validador de <code>BODEGA.xls</code>
          </li>
        </ul>
      </div>
    </main>
  );
}
