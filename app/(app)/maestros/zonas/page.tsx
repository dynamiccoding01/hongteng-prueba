import Link from 'next/link';
import { requerirPermiso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado, Etiqueta, Tabla, Td, Th, Vacio, numero } from '@/components/ui';
import { AreaTexto, Campo, FormularioDesplegable, Seleccion } from '@/components/formulario';
import { DistintivoBodega, PuntoBodega, SelectorBodega } from '@/components/color-bodega';
import { Paginacion } from '@/components/paginacion';
import { clavesPaginacion, leerPaginacion } from '@/lib/paginacion';
import { estiloBodega } from '@/lib/colores-bodega';
import { guardarBodega, guardarZona } from './acciones';

export const metadata = { title: 'Bodegas y zonas · Inventario' };

interface Opcion {
  valor: string | number;
  texto: string;
}

interface Bodega {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  color: string;
  activo: boolean;
}

interface Zona {
  id: number;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
  bodega: { id: number; codigo: string; nombre: string; color: string } | null;
}

const ESTADOS: Opcion[] = [
  { valor: '1', texto: 'Activa' },
  { valor: '0', texto: 'Inactiva' },
];

function CamposBodega({ b }: { b?: Bodega }) {
  return (
    <>
      {b ? <input type="hidden" name="id" value={b.id} /> : null}
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={b?.codigo}
        requerido
        ejemplo="IQQ"
        largoMax={10}
        transformar="codigo"
        ayuda="Se guarda en mayúsculas y sin espacios"
      />
      <Campo
        etiqueta="Nombre"
        nombre="nombre"
        valor={b?.nombre}
        requerido
        ejemplo="Iquique — ZOFRI"
        largoMax={80}
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={b ? (b.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
      <AreaTexto
        etiqueta="Dirección"
        nombre="direccion"
        valor={b?.direccion}
        largoMax={200}
        filas={2}
      />
      {/*
       * El color no se pide ni se edita: lo asigna la base al crear la bodega
       * (0017). Aquí solo se dice cuál le tocó, para que no parezca que falta
       * un campo.
       */}
      <p className="flex items-center gap-2 text-sm text-tenue sm:col-span-2">
        {b ? (
          <>
            <PuntoBodega color={b.color} />
            Color asignado por el sistema. No se edita.
          </>
        ) : (
          'El sistema le asignará un color libre para distinguirla de las demás.'
        )}
      </p>
    </>
  );
}

function CamposZona({ z, bodegas }: { z?: Zona; bodegas: Bodega[] }) {
  return (
    <>
      {z ? <input type="hidden" name="id" value={z.id} /> : null}
      <SelectorBodega nombre="bodega_id" valor={z?.bodega?.id} bodegas={bodegas} requerido />
      <Campo
        etiqueta="Código"
        nombre="codigo"
        valor={z?.codigo}
        requerido
        ejemplo="1-4 · M2-4 · 3-8"
        largoMax={20}
        transformar="codigo"
        ayuda="Se guarda en mayúsculas y sin espacios"
      />
      <Seleccion
        etiqueta="Estado"
        nombre="activo"
        valor={z ? (z.activo ? '1' : '0') : '1'}
        opciones={ESTADOS}
        requerido
      />
      <AreaTexto
        etiqueta="Descripción"
        nombre="descripcion"
        valor={z?.descripcion}
        largoMax={200}
        filas={2}
      />
    </>
  );
}

/** MAE-04: bodegas y sus zonas de ubicación, normalizadas. */
export default async function Zonas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requerirPermiso('zona.ver');
  const puedeEditar = usuario.permisos.has('zona.editar');

  // Dos listados independientes: cada uno lleva su propio par de parámetros
  // para que moverse en las zonas no reinicie la página de las bodegas.
  const crudos = await searchParams;
  const pgBodegas = leerPaginacion(crudos, 'bodegas');
  const pgZonas = leerPaginacion(crudos, 'zonas');

  // Filtro de zonas por bodega. Lo escribe cualquiera en la URL: si no es un id
  // razonable se ignora en vez de romper la consulta.
  const filtroCrudo = typeof crudos['bodega'] === 'string' ? Number(crudos['bodega']) : NaN;
  const filtroBodega = Number.isInteger(filtroCrudo) && filtroCrudo > 0 ? filtroCrudo : null;

  const supabase = await crearClienteServidor();

  let consultaZonas = supabase
    .from('zona')
    .select('id, codigo, descripcion, activo, bodega:bodega_id(id, codigo, nombre, color)', {
      count: 'exact',
    })
    .order('codigo')
    .range(pgZonas.desde, pgZonas.hasta);

  if (filtroBodega !== null) consultaZonas = consultaZonas.eq('bodega_id', filtroBodega);

  const [
    { data: bodegas, count: totalBodegas, error: errorBodegas },
    { data: zonas, count: totalZonas, error: errorZonas },
    { data: todasLasBodegas },
    { data: bodegaDeCadaZona },
  ] = await Promise.all([
    supabase
      .from('bodega')
      .select('id, codigo, nombre, direccion, color, activo', { count: 'exact' })
      .order('codigo')
      .range(pgBodegas.desde, pgBodegas.hasta),
    consultaZonas,
    // El selector del formulario y los filtros necesitan TODAS las bodegas, no
    // la página que se esté mirando: son opciones a elegir, no un listado.
    supabase
      .from('bodega')
      .select('id, codigo, nombre, direccion, color, activo')
      .eq('activo', true)
      .order('codigo'),
    // La columna «Zonas» y los contadores de los filtros cuentan todas las
    // zonas de cada bodega, no las que caen en la página visible. Consulta
    // aparte con una sola columna, igual que los totales de los reportes.
    supabase.from('zona').select('bodega_id'),
  ]);

  const error = errorBodegas ?? errorZonas;
  if (error) return <Vacio>No se pudieron cargar los datos: {error.message}</Vacio>;

  const opcionesBodega: Bodega[] = todasLasBodegas ?? [];

  const zonasPorBodega = new Map<number, number>();
  for (const z of bodegaDeCadaZona ?? []) {
    zonasPorBodega.set(z.bodega_id, (zonasPorBodega.get(z.bodega_id) ?? 0) + 1);
  }

  // Enlaces del filtro: conservan lo demás de la URL y borran la página de
  // zonas, porque la 7 puede no existir dentro de una sola bodega.
  const clavesZonas = clavesPaginacion('zonas');
  const base = new URLSearchParams();
  for (const [clave, valor] of Object.entries(crudos)) {
    const unico = typeof valor === 'string' ? valor : Array.isArray(valor) ? valor.at(-1) : null;
    if (unico) base.set(clave, unico);
  }
  function enlaceFiltro(bodegaId: number | null): string {
    const destino = new URLSearchParams(base);
    if (bodegaId === null) destino.delete('bodega');
    else destino.set('bodega', String(bodegaId));
    destino.delete(clavesZonas.pagina);
    const consulta = destino.toString();
    return consulta ? `?${consulta}` : '?';
  }

  return (
    <>
      <Encabezado
        titulo="Bodegas y zonas"
        descripcion="Ubicaciones físicas de la mercadería (MAE-04)"
      />

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Bodegas</h2>
          {puedeEditar ? (
            <FormularioDesplegable accion={guardarBodega} etiquetaNuevo="Nueva bodega">
              <CamposBodega />
            </FormularioDesplegable>
          ) : null}
        </div>

        {(bodegas ?? []).length === 0 ? (
          <Vacio>No hay bodegas registradas.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Bodega</Th>
                <Th>Nombre</Th>
                <Th>Dirección</Th>
                <Th numerico>Zonas</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {(bodegas ?? []).map((b) => (
                <tr key={b.id}>
                  <Td className={`border-l-4 ${estiloBodega(b.color).borde}`}>
                    <DistintivoBodega codigo={b.codigo} color={b.color} titulo={b.nombre} />
                  </Td>
                  <Td>{b.nombre}</Td>
                  <Td tenue>{b.direccion ?? '—'}</Td>
                  <Td numerico tenue>
                    {numero(zonasPorBodega.get(b.id) ?? 0)}
                  </Td>
                  <Td>
                    <Etiqueta tono={b.activo ? 'verde' : 'neutro'}>
                      {b.activo ? 'Activa' : 'Inactiva'}
                    </Etiqueta>
                  </Td>
                  {puedeEditar ? (
                    <Td>
                      <FormularioDesplegable accion={guardarBodega} etiquetaNuevo="" esEdicion>
                        <CamposBodega b={b} />
                      </FormularioDesplegable>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}

        <Paginacion
          total={totalBodegas ?? 0}
          pagina={pgBodegas.pagina}
          porPagina={pgBodegas.porPagina}
          prefijo="bodegas"
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Zonas <span className="ml-1 text-xs text-zinc-500">区域</span>
          </h2>
          {puedeEditar && opcionesBodega.length > 0 ? (
            <FormularioDesplegable accion={guardarZona} etiquetaNuevo="Nueva zona">
              <CamposZona bodegas={opcionesBodega} />
            </FormularioDesplegable>
          ) : null}
        </div>

        {/*
         * Los filtros hacen de leyenda: son los mismos colores con los que se
         * marcan las filas, así que se aprende el código de color usándolo.
         */}
        {opcionesBodega.length > 1 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link
              href={enlaceFiltro(null)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filtroBodega === null
                  ? 'bg-zinc-800 font-medium text-white dark:bg-zinc-200 dark:text-zinc-900'
                  : 'border border-borde text-tenue hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              Todas
            </Link>
            {opcionesBodega.map((b) => {
              const estilo = estiloBodega(b.color);
              const elegida = filtroBodega === b.id;
              return (
                <Link
                  key={b.id}
                  href={enlaceFiltro(b.id)}
                  title={b.nombre}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ring-offset-2 ring-offset-fondo ${estilo.distintivo} ${
                    elegida ? `ring-2 ${estilo.anillo}` : ''
                  }`}
                >
                  <span className="font-semibold">{b.codigo}</span>
                  <span className="opacity-70">{numero(zonasPorBodega.get(b.id) ?? 0)}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {(zonas ?? []).length === 0 ? (
          <Vacio>
            {filtroBodega !== null ? (
              <>Esta bodega todavía no tiene zonas.</>
            ) : (
              <>
                No hay zonas registradas. Se crearán automáticamente al migrar{' '}
                <code>BODEGA.xls</code>, o puede agregarlas a mano.
              </>
            )}
          </Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Zona</Th>
                <Th>Bodega</Th>
                <Th>Descripción</Th>
                <Th>Estado</Th>
                {puedeEditar ? <Th> </Th> : null}
              </tr>
            </thead>
            <tbody>
              {(zonas ?? []).map((z) => (
                <tr key={z.id}>
                  <Td className={`border-l-4 ${estiloBodega(z.bodega?.color).borde}`}>
                    <span className="inline-flex items-center gap-2">
                      <PuntoBodega color={z.bodega?.color} />
                      <code className="text-xs">{z.codigo}</code>
                    </span>
                  </Td>
                  <Td>
                    {z.bodega ? (
                      <DistintivoBodega
                        codigo={z.bodega.codigo}
                        color={z.bodega.color}
                        titulo={z.bodega.nombre}
                      />
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td tenue>{z.descripcion ?? '—'}</Td>
                  <Td>
                    <Etiqueta tono={z.activo ? 'verde' : 'neutro'}>
                      {z.activo ? 'Activa' : 'Inactiva'}
                    </Etiqueta>
                  </Td>
                  {puedeEditar ? (
                    <Td>
                      <FormularioDesplegable accion={guardarZona} etiquetaNuevo="" esEdicion>
                        <CamposZona z={z} bodegas={opcionesBodega} />
                      </FormularioDesplegable>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}

        <Paginacion
          total={totalZonas ?? 0}
          pagina={pgZonas.pagina}
          porPagina={pgZonas.porPagina}
          prefijo="zonas"
        />
      </section>
    </>
  );
}
