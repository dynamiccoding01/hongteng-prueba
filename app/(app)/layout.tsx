import { Marco } from '@/components/marco';
import { Navegacion } from '@/components/navegacion';
import { ProveedorIdioma } from '@/components/proveedor-idioma';
import { ProveedorToast } from '@/components/proveedor-toast';
import { requerirUsuario } from '@/lib/auth';
import { obtenerIdioma, obtenerTema } from '@/lib/preferencias';

/**
 * Layout de las paginas privadas. Todo lo que cuelga de aqui exige sesion.
 * El middleware ya redirige, pero se comprueba de nuevo: nunca se confia en
 * una sola barrera.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const [usuario, idioma, tema] = await Promise.all([
    requerirUsuario(),
    obtenerIdioma(),
    obtenerTema(),
  ]);

  return (
    <ProveedorToast>
      <ProveedorIdioma idioma={idioma}>
        <Marco navegacion={<Navegacion usuario={usuario} idioma={idioma} tema={tema} />}>
          {children}
        </Marco>
      </ProveedorIdioma>
    </ProveedorToast>
  );
}
