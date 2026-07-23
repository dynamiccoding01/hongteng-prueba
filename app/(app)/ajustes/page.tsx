import { requerirUsuario } from '@/lib/auth';
import { obtenerIdioma, obtenerTema } from '@/lib/preferencias';
import { t } from '@/lib/i18n';
import { Encabezado, Tarjeta } from '@/components/ui';
import { SelectorTema } from '@/components/selector-tema';
import { SelectorIdioma } from '@/components/selector-idioma';

export const metadata = { title: 'Ajustes · Inventario' };

/**
 * Preferencias personales de interfaz: tema y idioma. Guardadas en cookie,
 * no en base de datos — son del navegador, no del usuario del sistema.
 * Sin permiso requerido: es preferencia propia, no acceso a datos.
 */
export default async function Ajustes() {
  await requerirUsuario();
  const [idioma, tema] = await Promise.all([obtenerIdioma(), obtenerTema()]);

  return (
    <>
      <Encabezado
        titulo={t(idioma, 'ajustesTitulo')}
        descripcion={t(idioma, 'ajustesDescripcion')}
      />

      <div className="max-w-md space-y-6">
        <Tarjeta>
          <p className="mb-3 text-sm font-medium">{t(idioma, 'ajustesTema')}</p>
          <SelectorTema temaActual={tema} idioma={idioma} />
        </Tarjeta>

        <Tarjeta>
          <p className="mb-3 text-sm font-medium">{t(idioma, 'ajustesIdioma')}</p>
          <SelectorIdioma idioma={idioma} />
          <p className="mt-3 text-xs text-zinc-500">{t(idioma, 'ajustesNota')}</p>
        </Tarjeta>
      </div>
    </>
  );
}
