-- ---------------------------------------------------------------------------
-- 0033 · Los totales de los reportes se calculan en la base (REP-05, REP-07)
--
-- Las dos paginas de reportes armaban sus resumenes asi:
--
--     supabase.from('v_ventas_detalle').select('cliente, producto, cajas, monto_clp')
--
-- Sin `range`, sin `limit` y sin `count`: se traian el periodo entero para
-- sumarlo en TypeScript. Dos problemas, y el segundo es el grave:
--
--   1. Incumple la regla del proyecto —ninguna consulta de listado trae la
--      tabla entera— por partida doble: ni pagina ni acota.
--   2. PostgREST corta en `db-max-rows` (1000 por defecto) **sin decirlo**.
--      Pasadas mil lineas en el periodo, el total del encabezado y las dos
--      tablas de resumen son numeros cortos que parecen correctos. Un reporte
--      que miente en silencio es peor que uno que no carga.
--
-- Asi que la agregacion baja a la base, que es donde se puede hacer sin traer
-- las filas. Cada funcion devuelve pocas filas: una por cliente o proveedor,
-- una por articulo, y una fila TOTAL que va **primera** —para que siga estando
-- aunque alguna vez el resto se corte— con el total exacto del periodo.
--
-- `language sql` + `stable`, sin `security definer`: se ejecutan con los
-- permisos de quien llama, asi que la RLS de las tablas de abajo sigue
-- decidiendo que filas se agregan. Un vendedor sin `importacion.ver` obtiene
-- ceros, no las compras de la empresa.
--
-- `sin_importe` cuenta las lineas que no se pueden valorizar (una venta sin
-- precio, una compra sin costo). Desde 0032 no se pueden crear nuevas, pero las
-- historicas existen: contarlas aparte es la unica forma de que la pagina diga
-- «faltan 3 lineas por valorizar» en vez de sumarlas como cero.
-- ---------------------------------------------------------------------------

drop function if exists fn_ventas_resumen(date, date);

create function fn_ventas_resumen(p_desde date default null, p_hasta date default null)
returns table (
  agrupacion  text,
  clave       text,
  cajas       numeric,
  monto_clp   numeric,
  lineas      bigint,
  sin_importe bigint
)
language sql
stable
as $$
  with base as (
    select *
      from v_ventas_detalle
     where (p_desde is null or fecha >= p_desde)
       and (p_hasta is null or fecha <= p_hasta)
  ),
  resumen as (
    select 0 as orden, 'TOTAL'::text as agrupacion, ''::text as clave,
           coalesce(sum(cajas), 0) as cajas,
           coalesce(sum(monto_clp), 0) as monto_clp,
           count(*) as lineas,
           count(*) filter (where monto_clp is null) as sin_importe
      from base
    union all
    select 1, 'CLIENTE', cliente,
           coalesce(sum(cajas), 0), coalesce(sum(monto_clp), 0),
           count(*), count(*) filter (where monto_clp is null)
      from base group by cliente
    union all
    select 2, 'PRODUCTO', producto,
           coalesce(sum(cajas), 0), coalesce(sum(monto_clp), 0),
           count(*), count(*) filter (where monto_clp is null)
      from base group by producto
  )
  select agrupacion, clave, cajas, monto_clp, lineas, sin_importe
    from resumen
   order by orden, monto_clp desc, clave;
$$;

comment on function fn_ventas_resumen is
  'REP-05: totales del periodo por cliente y por producto, agregados en la base. La fila TOTAL va primera.';

drop function if exists fn_compras_resumen(date, date);

create function fn_compras_resumen(p_desde date default null, p_hasta date default null)
returns table (
  agrupacion  text,
  clave       text,
  cajas       numeric,
  monto_clp   numeric,
  lineas      bigint,
  sin_importe bigint
)
language sql
stable
as $$
  with base as (
    select *
      from v_compras_detalle
     where (p_desde is null or fecha >= p_desde)
       and (p_hasta is null or fecha <= p_hasta)
  ),
  resumen as (
    select 0 as orden, 'TOTAL'::text as agrupacion, ''::text as clave,
           coalesce(sum(cajas), 0) as cajas,
           coalesce(sum(monto_clp), 0) as monto_clp,
           count(*) as lineas,
           count(*) filter (where monto_clp is null) as sin_importe
      from base
    union all
    select 1, 'PROVEEDOR', proveedor,
           coalesce(sum(cajas), 0), coalesce(sum(monto_clp), 0),
           count(*), count(*) filter (where monto_clp is null)
      from base group by proveedor
    union all
    select 2, 'PRODUCTO', producto,
           coalesce(sum(cajas), 0), coalesce(sum(monto_clp), 0),
           count(*), count(*) filter (where monto_clp is null)
      from base group by producto
  )
  select agrupacion, clave, cajas, monto_clp, lineas, sin_importe
    from resumen
   order by orden, monto_clp desc, clave;
$$;

comment on function fn_compras_resumen is
  'REP-07: totales del periodo por proveedor y por producto, agregados en la base. La fila TOTAL va primera.';
