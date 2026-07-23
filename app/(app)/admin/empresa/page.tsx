import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Vacio } from '@/components/ui';
import { Campo, FormularioDesplegable } from '@/components/formulario';
import { guardarEmpresa } from './acciones';

export const metadata = { title: 'Empresa · Inventario' };

/** ADM-03: datos de la empresa, usados en los documentos emitidos. */
export default async function Empresa() {
  const usuario = await requerirPermiso('empresa.ver');
  const puedeEditar = usuario.permisos.has('empresa.editar');

  const supabase = await crearClienteServidor();
  const { data: empresa, error } = await supabase.from('empresa').select('*').eq('id', 1).single();

  if (error) return <Vacio>No se pudo cargar la empresa: {error.message}</Vacio>;

  return (
    <>
      <Encabezado titulo="Empresa" descripcion="Datos usados al emitir documentos (ADM-03)" />

      {!empresa.rut ? (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
          El RUT todavía no está confirmado con el cliente. Los documentos se pueden emitir, pero
          revísense antes de presentarlos ante Aduanas.
        </p>
      ) : null}

      {puedeEditar ? (
        <FormularioDesplegable accion={guardarEmpresa} etiquetaNuevo="Editar datos" esEdicion>
          <Campo
            etiqueta="Razón social"
            nombre="razon_social"
            valor={empresa.razon_social}
            requerido
            ancho="completo"
          />
          <Campo etiqueta="RUT" nombre="rut" valor={empresa.rut} ejemplo="76.123.456-7" />
          <Campo etiqueta="Giro" nombre="giro" valor={empresa.giro} />
          <Campo
            etiqueta="Dirección"
            nombre="direccion"
            valor={empresa.direccion}
            ancho="completo"
          />
          <Campo etiqueta="Ciudad" nombre="ciudad" valor={empresa.ciudad} />
          <Campo etiqueta="Teléfono" nombre="telefono" valor={empresa.telefono} />
          <Campo etiqueta="Correo" nombre="email" valor={empresa.email} tipo="email" />
        </FormularioDesplegable>
      ) : null}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Razón social</dt>
          <dd className="font-medium">{empresa.razon_social}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">RUT</dt>
          <dd className="font-medium">{empresa.rut ?? 'sin confirmar'}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Giro</dt>
          <dd className="font-medium">{empresa.giro ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Dirección</dt>
          <dd className="font-medium">
            {empresa.direccion ?? '—'}
            {empresa.ciudad ? `, ${empresa.ciudad}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Teléfono</dt>
          <dd className="font-medium">{empresa.telefono ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Correo</dt>
          <dd className="font-medium">{empresa.email ?? '—'}</dd>
        </div>
      </dl>
    </>
  );
}
