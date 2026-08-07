import { z } from 'zod';
import { requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { ZONA, comoDia, diasAtras, limites } from '@/lib/bitacora/rango-fechas';
import { leerPaginacion } from '@/lib/paginacion';
import { Paginacion } from '@/components/paginacion';
import { Filtros, type OpcionUsuario } from './filtros';

export const metadata = { title: 'Bitácora · Inventario' };

const TONO_ACCION = {
  INSERT: 'verde',
  UPDATE: 'ambar',
  DELETE: 'rojo',
  LOGIN: 'neutro',
  LOGOUT: 'neutro',
} as const;

/** Dominio cerrado, igual que el check de la tabla `bitacora`. */
const ACCIONES = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FALLIDO',
  'EXPORTAR',
  'IMPRIMIR',
  'ANULAR',
  'CONFIRMAR',
  'MIGRAR',
  'RESPALDAR',
];

const DIAS_POR_DEFECTO = 30;

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: ZONA,
  }).format(new Date(iso));
}

const esquemaFiltros = z.object({
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  usuario: z.string().uuid().optional(),
  accion: z.enum(ACCIONES as [string, ...string[]]).optional(),
});

/**
 * ADM-02. Quien ve qué:
 *  - con permiso bitacora.ver, toda la actividad del sistema;
 *  - sin él, solo la propia. Lo decide RLS, no esta página.
 */
export default async function Bitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirUsuario();
  const veTodo = usuario.permisos.has('bitacora.ver');

  const crudos = await searchParams;
  // Un parámetro inválido no rompe la página: se ignora y se usa el rango por defecto.
  const filtros = esquemaFiltros.safeParse({
    desde: typeof crudos['desde'] === 'string' && crudos['desde'] ? crudos['desde'] : undefined,
    hasta: typeof crudos['hasta'] === 'string' && crudos['hasta'] ? crudos['hasta'] : undefined,
    usuario:
      typeof crudos['usuario'] === 'string' && crudos['usuario'] ? crudos['usuario'] : undefined,
    accion: typeof crudos['accion'] === 'string' && crudos['accion'] ? crudos['accion'] : undefined,
  });

  const hoy = new Date();
  const valores = filtros.success ? filtros.data : {};
  // Por defecto, el último mes: abrir la bitácora sin filtros no debe traer años.
  const hasta = valores.hasta ?? comoDia(hoy);
  const desde = valores.desde ?? diasAtras(hoy, DIAS_POR_DEFECTO);
  const usuarioId = valores.usuario ?? '';
  const accion = valores.accion ?? '';

  const { inicio, fin } = limites(desde, hasta);
  const { pagina, porPagina, desde: primera, hasta: ultima } = leerPaginacion(crudos);
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from('v_bitacora')
    .select('*', { count: 'exact' })
    .gte('created_at', inicio)
    .lt('created_at', fin)
    .order('created_at', { ascending: false })
    .range(primera, ultima);

  if (usuarioId) consulta = consulta.eq('usuario_id', usuarioId);
  if (accion) consulta = consulta.eq('accion', accion);

  const [{ data: registros, count, error }, { data: usuarios }] = await Promise.all([
    consulta,
    // Solo para poblar el desplegable. Si RLS no deja leer la lista de usuarios,
    // llega vacía y el filtro por usuario simplemente no se ofrece.
    veTodo
      ? supabase.from('usuario').select('id, nombre').order('nombre')
      : Promise.resolve({ data: null }),
  ]);

  if (error) return <Vacio>No se pudo cargar la bitácora: {error.message}</Vacio>;

  const total = count ?? 0;
  const opcionesUsuario: OpcionUsuario[] | null =
    veTodo && usuarios && usuarios.length > 0 ? usuarios : null;

  return (
    <>
      <Encabezado
        titulo={veTodo ? 'Bitácora' : 'Mi actividad'}
        descripcion={
          veTodo
            ? 'Toda acción de usuario queda registrada y no se puede editar ni borrar'
            : 'Su historial de acciones en el sistema'
        }
      />

      <Filtros
        desde={desde}
        hasta={hasta}
        usuarioId={usuarioId}
        accion={accion}
        usuarios={opcionesUsuario}
        acciones={ACCIONES}
        porPagina={porPagina}
      />

      <p className="mb-3 text-sm text-tenue">
        {total === 0
          ? 'Sin registros en el período elegido.'
          : `${numero(total)} ${total === 1 ? 'registro' : 'registros'} entre el ${desde} y el ${hasta}.`}
      </p>

      {registros.length === 0 ? (
        <Vacio>No hay actividad registrada con esos filtros.</Vacio>
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

      <Paginacion total={total} pagina={pagina} porPagina={porPagina} />
    </>
  );
}
