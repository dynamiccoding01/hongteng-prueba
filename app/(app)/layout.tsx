import { Navegacion } from '@/components/navegacion';
import { requerirUsuario } from '@/lib/auth';

/**
 * Layout de las paginas privadas. Todo lo que cuelga de aqui exige sesion.
 * El middleware ya redirige, pero se comprueba de nuevo: nunca se confia en
 * una sola barrera.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await requerirUsuario();

  return (
    <div className="flex min-h-screen">
      <Navegacion usuario={usuario} />
      <main className="flex-1 overflow-x-auto px-8 py-6">{children}</main>
    </div>
  );
}
