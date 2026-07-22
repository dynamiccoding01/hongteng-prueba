import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio } from '@/components/ui';

export const metadata = { title: 'Bitácora · Inventario' };

const TONO_ACCION = {
  INSERT: 'verde',
  UPDATE: 'ambar',
  DELETE: 'rojo',
  LOGIN: 'neutro',
  LOGOUT: 'neutro',
} as const;

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(iso));
}

/**
 * ADM-02. Quien ve que:
 *  - con permiso bitacora.ver, toda la actividad del sistema;
 *  - sin él, solo la propia. Lo decide RLS, no esta página.
 */
export default async function Bitacora() {
  const usuario = await requerirUsuario();
  const veTodo = usuario.permisos.has('bitacora.ver');

  const supabase = await crearClienteServidor();
  const { data: registros, error } = await supabase
    .from('v_bitacora')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return <Vacio>No se pudo cargar la bitácora: {error.message}</Vacio>;

  return (
    <>
      <Encabezado
        titulo={veTodo ? 'Bitácora' : 'Mi actividad'}
        descripcion={
          veTodo
            ? 'Toda acción de usuario queda registrada. Últimos 200 registros.'
            : 'Su historial de acciones en el sistema.'
        }
      />

      {registros.length === 0 ? (
        <Vacio>Todavía no hay actividad registrada.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              {veTodo ? <Th>Usuario</Th> : null}
              <Th>Acción</Th>
              <Th>Tabla</Th>
              <Th>Registro</Th>
              <Th>Detalle</Th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <Td tenue>{r.created_at ? fecha(r.created_at) : '—'}</Td>
                {veTodo ? (
                  <Td>
                    {r.usuario_nombre}
                    {r.rol ? <span className="ml-2 text-xs text-zinc-500">{r.rol}</span> : null}
                  </Td>
                ) : null}
                <Td>
                  <Etiqueta tono={TONO_ACCION[r.accion as keyof typeof TONO_ACCION] ?? 'neutro'}>
                    {r.accion}
                  </Etiqueta>
                </Td>
                <Td tenue>{r.tabla ?? '—'}</Td>
                <Td tenue>{r.registro_id ?? '—'}</Td>
                <Td tenue>
                  {r.descripcion ??
                    (r.campos_modificados?.length ? r.campos_modificados.join(', ') : '—')}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
