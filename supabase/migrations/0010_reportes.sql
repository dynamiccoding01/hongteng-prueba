-- ---------------------------------------------------------------------------
-- 0010 · Reportes y alertas (REP-02, REP-04, REP-05, INV-05)
--
-- Vistas de consulta con security_invoker: la RLS de las tablas subyacentes
-- decide quien ve que (las vistas antiguas del 0004 corren como owner; estas
-- nuevas ya siguen la practica recomendada).
-- ---------------------------------------------------------------------------

-- REP-02: salidas por mes y por variante (ventas, salidas manuales y traspasos
-- no cuentan: solo lo que salio de verdad hacia clientes o consumo).
create view v_salidas_mensuales
  with (security_invoker = true)
as
select
  date_trunc('month', m.fecha)::date as mes,
  v.id                               as variante_id,
  p.codigo,
  c.nombre_es                        as categoria,
  v.unidades_por_caja,
  sum(m.cajas)                       as cajas,
  sum(m.unidades)                    as unidades
from movimiento m
join producto_variante v on v.id = m.variante_id
join producto  p on p.id = v.producto_id
join categoria c on c.id = p.categoria_id
where m.tipo = 'SALIDA'
group by 1, v.id, p.codigo, c.nombre_es, v.unidades_por_caja;

comment on view v_salidas_mensuales is
  'REP-02: estadistica de salidas por mes y producto (equivalente a las hojas 统计).';

-- REP-04: valorizacion del stock al ultimo costo de importacion conocido,
-- convertido a CLP con el tipo de cambio fijado en esa importacion.
create view v_valorizacion
  with (security_invoker = true)
as
with ultimo_costo as (
  select distinct on (d.variante_id)
    d.variante_id,
    d.costo_caja,
    i.tipo_cambio,
    mo.codigo as moneda,
    i.id      as importacion_id
  from importacion_detalle d
  join importacion i on i.id = d.importacion_id and i.estado = 'CONFIRMADA'
  join moneda mo on mo.id = i.moneda_id
  where d.costo_caja is not null
  order by d.variante_id, i.fecha desc, d.id desc
)
select
  v.id                             as variante_id,
  p.codigo,
  c.nombre_es                      as categoria,
  v.unidades_por_caja,
  coalesce(sum(s.cajas), 0)        as cajas,
  u.costo_caja,
  u.moneda,
  u.tipo_cambio,
  -- Valor en CLP: costo x TC (si la moneda ya es CLP, TC nulo cuenta como 1).
  case
    when u.costo_caja is null then null
    else round(coalesce(sum(s.cajas), 0) * u.costo_caja * coalesce(u.tipo_cambio, 1), 0)
  end                              as valor_clp
from producto_variante v
join producto  p on p.id = v.producto_id
join categoria c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
left join ultimo_costo u on u.variante_id = v.id
group by v.id, p.codigo, c.nombre_es, v.unidades_por_caja,
         u.costo_caja, u.moneda, u.tipo_cambio;

comment on view v_valorizacion is
  'REP-04: stock valorizado al ultimo costo de importacion confirmada, en CLP.';

-- REP-05: ventas confirmadas linea a linea, para reportar por cliente,
-- producto y periodo.
create view v_ventas_detalle
  with (security_invoker = true)
as
select
  vd.id           as detalle_id,
  ve.id           as venta_id,
  ve.fecha,
  cl.id           as cliente_id,
  cl.codigo       as cliente_codigo,
  cl.nombre       as cliente,
  p.codigo        as producto,
  var.unidades_por_caja,
  vd.cajas,
  vd.precio_caja,
  mo.codigo       as moneda,
  ve.tipo_cambio,
  case
    when vd.precio_caja is null then null
    else round(vd.cajas * vd.precio_caja * coalesce(ve.tipo_cambio, 1), 0)
  end             as monto_clp
from venta_detalle vd
join venta ve  on ve.id = vd.venta_id and ve.estado = 'CONFIRMADA'
join cliente cl on cl.id = ve.cliente_id
join producto_variante var on var.id = vd.variante_id
join producto p on p.id = var.producto_id
join moneda mo on mo.id = ve.moneda_id;

comment on view v_ventas_detalle is
  'REP-05: lineas de ventas confirmadas con cliente, producto y monto en CLP.';

-- INV-05: variantes con stock igual o bajo el minimo definido (>0).
create view v_alertas_stock
  with (security_invoker = true)
as
select
  v.id                      as variante_id,
  p.codigo,
  c.nombre_es               as categoria,
  v.unidades_por_caja,
  v.stock_minimo,
  coalesce(sum(s.cajas), 0) as cajas
from producto_variante v
join producto  p on p.id = v.producto_id
join categoria c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where v.activo and p.activo and v.stock_minimo > 0
group by v.id, p.codigo, c.nombre_es, v.unidades_por_caja, v.stock_minimo
having coalesce(sum(s.cajas), 0) <= v.stock_minimo;

comment on view v_alertas_stock is
  'INV-05: variantes en o bajo su stock minimo (solo las que definieron minimo).';
