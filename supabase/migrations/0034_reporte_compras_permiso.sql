-- ---------------------------------------------------------------------------
-- 0034 · El reporte de compras deja de abrir el modulo Compras (REP-07)
--
-- 0031 concedio `importacion.ver` a Ventas y Consulta para que el reporte de
-- compras no les saliera vacio. Funcionaba, pero conceder ese permiso da mucho
-- mas que el reporte: el modulo Compras entero en modo consulta —borradores,
-- documentos de aduana, el detalle linea a linea de cada importacion—.
--
-- El cliente pidio que los reportes los vea todo el mundo, no que todo el mundo
-- entre a Compras. Son dos cosas distintas y ahora se piden por separado:
--
--   · `reporte_compras.ver`  → los totales del periodo por proveedor y producto.
--   · `importacion.ver`      → el modulo Compras.
--
-- El costo sigue estando a la vista de quien tenga el reporte: es de lo que
-- trata REP-07, y eso ya se decidio. Lo que cambia es que ver el reporte ya no
-- arrastra lo demas.
--
-- Como la vista es `security_invoker`, el reporte pasa a leerse por dos
-- funciones `security definer` que comprueban el permiso nuevo antes de
-- devolver nada. Es el mismo patron de `fn_confirmar_venta`: la funcion se
-- salta la RLS a proposito y por eso empieza preguntando.
-- ---------------------------------------------------------------------------

-- El codigo lleva guion bajo y no un segundo punto: `permiso_codigo_formato_ck`
-- (0002) solo admite `recurso.accion`, un punto y nada mas.
insert into permiso (codigo, modulo, descripcion) values
  ('reporte_compras.ver', 'reportes', 'Ver el reporte de compras por periodo')
on conflict (codigo) do nothing;

-- Lo recibe quien ya veia reportes: es el mismo publico, sin el efecto lateral.
insert into rol_permiso (rol_id, permiso_id)
select rp.rol_id, nuevo.id
  from rol_permiso rp
  join permiso p on p.id = rp.permiso_id and p.codigo = 'reporte.ver'
  cross join (select id from permiso where codigo = 'reporte_compras.ver') as nuevo
on conflict do nothing;

-- Y se revierte 0031: Ventas y Consulta vuelven a no ver el modulo Compras.
-- Bodeguero y Administrador conservan `importacion.ver`, que ya tenian de antes
-- por su trabajo y no por el reporte.
delete from rol_permiso rp
 using rol r, permiso p
 where rp.rol_id = r.id
   and rp.permiso_id = p.id
   and p.codigo = 'importacion.ver'
   and r.nombre in ('Ventas', 'Consulta');

-- ---------------------------------------------------------------------------
-- El detalle del periodo
--
-- `returns setof v_compras_detalle` para no repetir la lista de columnas: la
-- vista sigue siendo la definicion de que es una linea de compra. PostgREST
-- admite `order` y `range` sobre el resultado, asi que la pagina pagina igual.
-- ---------------------------------------------------------------------------
create or replace function fn_compras_detalle(
  p_desde date default null,
  p_hasta date default null
)
returns setof v_compras_detalle
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not tiene_permiso('reporte_compras.ver') then
    raise exception 'No tiene permiso para ver el reporte de compras';
  end if;

  return query
    select *
      from v_compras_detalle
     where (p_desde is null or fecha >= p_desde)
       and (p_hasta is null or fecha <= p_hasta);
end;
$$;

comment on function fn_compras_detalle is
  'REP-07: lineas de compras confirmadas del periodo. Exige reporte_compras.ver, no importacion.ver.';

-- ---------------------------------------------------------------------------
-- El resumen, con la misma puerta
--
-- Antes era `language sql` e invoker, o sea que dependia de `importacion.ver`.
-- Con el permiso nuevo eso devolveria ceros a quien si tiene derecho al
-- reporte, que es peor que un error: un total de cero se lee como «no hubo
-- compras».
-- ---------------------------------------------------------------------------
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not tiene_permiso('reporte_compras.ver') then
    raise exception 'No tiene permiso para ver el reporte de compras';
  end if;

  return query
  with base as (
    select *
      from v_compras_detalle
     where (p_desde is null or fecha >= p_desde)
       and (p_hasta is null or fecha <= p_hasta)
  ),
  resumen as (
    select 0 as orden, 'TOTAL'::text as agrupacion, ''::text as clave,
           coalesce(sum(b.cajas), 0) as cajas,
           coalesce(sum(b.monto_clp), 0) as monto_clp,
           count(*) as lineas,
           count(*) filter (where b.monto_clp is null) as sin_importe
      from base b
    union all
    select 1, 'PROVEEDOR', b.proveedor,
           coalesce(sum(b.cajas), 0), coalesce(sum(b.monto_clp), 0),
           count(*), count(*) filter (where b.monto_clp is null)
      from base b group by b.proveedor
    union all
    select 2, 'PRODUCTO', b.producto,
           coalesce(sum(b.cajas), 0), coalesce(sum(b.monto_clp), 0),
           count(*), count(*) filter (where b.monto_clp is null)
      from base b group by b.producto
  )
  select r.agrupacion, r.clave, r.cajas, r.monto_clp, r.lineas, r.sin_importe
    from resumen r
   order by r.orden, r.monto_clp desc, r.clave;
end;
$$;

comment on function fn_compras_resumen is
  'REP-07: totales del periodo por proveedor y producto. Exige reporte_compras.ver. La fila TOTAL va primera.';
