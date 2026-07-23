import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { guardarVendedor } from './acciones';

export const metadata = { title: 'Vendedores · Inventario' };

/** VEN-05: usuarios con rol de vendedor y su porcentaje de comisión. */
export default async function Vendedores() {
  const usuario = await requerirPermiso('vendedor.ver');
  const puedeEditar = usuario.permisos.has('vendedor.editar');

  const supabase = await crearClienteServidor();

  const [{ data: vendedores, error }, { data: usuarios }] = await Promise.all([
    supabase
      .from('vendedor')
      .select('id, usuario_id, porcentaje_comision, activo, usuario:usuario_id(nombre, email)')
      .order('id'),
    supabase.from('usuario').select('id, nombre, email').eq('activo', true).order('nombre'),
  ]);

  if (error) return <Vacio>No se pudieron cargar los vendedores: {error.message}</Vacio>;

  const usuariosConVendedor = new Set((vendedores ?? []).map((v) => v.usuario_id));
  const usuariosSinVendedor = (usuarios ?? []).filter((u) => !usuariosConVendedor.has(u.id));
  const opcionesUsuario = usuariosSinVendedor.map((u) => ({ valor: u.id, texto: u.nombre }));

  return (
    <>
      <Encabezado titulo="Vendedores" descripcion="Porcentaje de comisión por usuario (VEN-05)">
        {puedeEditar && opcionesUsuario.length > 0 ? (
          <FormularioDesplegable accion={guardarVendedor} etiquetaNuevo="Nuevo vendedor">
            <Seleccion
              etiqueta="Usuario"
              nombre="usuario_id"
              opciones={opcionesUsuario}
              requerido
            />
            <Campo
              etiqueta="Porcentaje de comisión"
              nombre="porcentaje_comision"
              tipo="number"
              requerido
              ejemplo="5"
            />
          </FormularioDesplegable>
        ) : null}
      </Encabezado>

      {(vendedores ?? []).length === 0 ? (
        <Vacio>
          No hay vendedores registrados.
          {puedeEditar ? ' Use «Nuevo vendedor» para agregar el primero.' : ''}
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th numerico>% Comisión</Th>
              <Th>Estado</Th>
              {puedeEditar ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {(vendedores ?? []).map((v) => (
              <tr key={v.id}>
                <Td>
                  {v.usuario.nombre}
                  <span className="ml-2 text-xs text-zinc-500">{v.usuario.email}</span>
                </Td>
                <Td numerico>{numero(v.porcentaje_comision)} %</Td>
                <Td>
                  <Etiqueta tono={v.activo ? 'verde' : 'neutro'}>
                    {v.activo ? 'Activo' : 'Inactivo'}
                  </Etiqueta>
                </Td>
                {puedeEditar ? (
                  <Td>
                    <FormularioDesplegable accion={guardarVendedor} etiquetaNuevo="" esEdicion>
                      <input type="hidden" name="id" value={v.id} />
                      <Campo
                        etiqueta="Porcentaje de comisión"
                        nombre="porcentaje_comision"
                        valor={v.porcentaje_comision}
                        tipo="number"
                        requerido
                        ancho="completo"
                      />
                    </FormularioDesplegable>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
