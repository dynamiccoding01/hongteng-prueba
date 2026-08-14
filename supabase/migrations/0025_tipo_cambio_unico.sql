-- ---------------------------------------------------------------------------
-- 0025 · Un solo tipo de cambio, mantenido en un solo lugar
--
-- Contexto: los precios se llevan en dolares (0023, 0024) y al vender en pesos
-- se convierten. Eso convierte al tipo de cambio en el numero mas sensible del
-- sistema, y hasta aqui se tecleaba a mano en cada documento, sin pantalla que
-- lo mantuviera y sin nada que obligara a cargarlo.
--
-- Dos consecuencias, las dos reales:
--
--   1. Una venta en pesos sin tipo de cambio no podia tomar el precio de la
--      lista, y el sistema pedia escribirlo a mano.
--   2. Peor: `venta.tipo_cambio` era opcional, y las vistas de reportes
--      convertian con `coalesce(tipo_cambio, 1)`. Una venta en USD sin tipo de
--      cambio se reportaba como si un dolar valiera un peso. En los datos de
--      hoy, la venta 11 (10 USD) aparecia como 10 pesos en vez de 9.473.
--
-- Esta migracion fija un solo significado para la columna y lo hace cumplir:
--
--   `tipo_cambio` = cuantos pesos vale un dolar EN ESE DOCUMENTO.
--
-- Siempre presente, en pesos o en dolares. Sale de la tabla `tipo_cambio`
-- segun la fecha del documento, nadie lo teclea, y una vez creado el documento
-- queda congelado. Las vistas dejan de adivinar por el `coalesce` y preguntan
-- por la moneda.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- El tipo de cambio oficial de una fecha
-- ---------------------------------------------------------------------------
-- El que regia ese dia: el ultimo cargado con fecha igual o anterior. Si el
-- documento es anterior a todo lo que hay cargado se usa el mas antiguo
-- conocido, que es una aproximacion honesta y evita que un documento con fecha
-- vieja quede sin valorizar. Devuelve null solo si la tabla esta vacia.
create or replace function fn_tipo_cambio_vigente(p_fecha date default current_date)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select tc.valor
       from tipo_cambio tc
       join moneda m on m.id = tc.moneda_id
      where m.codigo = 'USD' and tc.fecha <= p_fecha
      order by tc.fecha desc
      limit 1),
    (select tc.valor
       from tipo_cambio tc
       join moneda m on m.id = tc.moneda_id
      where m.codigo = 'USD'
      order by tc.fecha asc
      limit 1)
  );
$$;

comment on function fn_tipo_cambio_vigente is
  'Pesos por dolar en una fecha, segun la tabla tipo_cambio. Es la unica fuente: ningun documento lo teclea.';

-- ---------------------------------------------------------------------------
-- Los documentos toman el oficial y lo congelan
-- ---------------------------------------------------------------------------
-- Se resuelve en la base y no en el acciones.ts por lo mismo que el color de
-- bodega (0017): elegir "el vigente a esta fecha" en TypeScript seria leer y
-- despues escribir, con una carrera en medio.
--
-- Al crear se toma siempre el oficial de la fecha del documento, se ignore lo
-- que venga: asi un documento con fecha atrasada queda con el tipo de cambio
-- que de verdad regia ese dia. Al corregir el documento no se recalcula nunca
-- --ni al cambiarle la fecha, ni si la tabla tipo_cambio se corrige despues--
-- porque los precios del detalle ya se calcularon con el valor original.
create or replace function fn_documento_tipo_cambio()
returns trigger
language plpgsql
as $$
declare
  v_valor numeric;
begin
  if tg_op = 'UPDATE' then
    new.tipo_cambio := old.tipo_cambio;
    return new;
  end if;

  v_valor := fn_tipo_cambio_vigente(new.fecha);

  if v_valor is null then
    raise exception
      'No hay ningun tipo de cambio del dolar cargado. Carguelo en Maestros > Tipo de cambio antes de emitir documentos';
  end if;

  new.tipo_cambio := v_valor;
  return new;
end;
$$;

comment on function fn_documento_tipo_cambio is
  'Pone el tipo de cambio oficial de la fecha al crear el documento y lo deja congelado.';

-- ---------------------------------------------------------------------------
-- Las ventas se emiten en dolares o en pesos, y no cambian de moneda con
-- detalle cargado
-- ---------------------------------------------------------------------------
-- El maestro tiene EUR, UF y UTM. De la unica que se sabe convertir es del
-- dolar, asi que ofrecer las otras solo servia para dejar la venta a medias.
--
-- Y cambiar la moneda con lineas ya cargadas es el mismo error de 1000x por
-- otra puerta: `venta_detalle.precio_caja` no guarda moneda propia --se lee en
-- la de la cabecera-- asi que pasar de USD a CLP convertiria 38 dolares en 38
-- pesos sin tocar una sola fila del detalle.
create or replace function fn_venta_moneda()
returns trigger
language plpgsql
as $$
declare
  v_codigo text;
  v_lineas int;
begin
  select codigo into v_codigo from moneda where id = new.moneda_id;

  if v_codigo is null or v_codigo not in ('USD', 'CLP') then
    raise exception 'Las ventas se emiten en dolares o en pesos: % no esta permitida',
      coalesce(v_codigo, 'esa moneda');
  end if;

  if tg_op = 'UPDATE' and new.moneda_id is distinct from old.moneda_id then
    select count(*) into v_lineas from venta_detalle where venta_id = old.id;

    if v_lineas > 0 then
      raise exception
        'La venta % tiene % linea(s) con precios en %: quite el detalle antes de cambiar la moneda',
        old.id, v_lineas, (select codigo from moneda where id = old.moneda_id);
    end if;
  end if;

  return new;
end;
$$;

comment on function fn_venta_moneda is
  'VEN-01: solo USD o CLP, y la moneda no cambia mientras haya detalle cargado con precios.';

-- ---------------------------------------------------------------------------
-- Los documentos que ya existen
-- ---------------------------------------------------------------------------
-- Las ventas 11 y 17 estan confirmadas y en dolares sin tipo de cambio: son
-- las que hoy se reportan como si un dolar valiera un peso. Se completan con
-- el oficial de su fecha. Los sellos de inmutabilidad se apartan solo para
-- esto y se vuelven a poner enseguida; la bitacora registra el cambio.
--
-- Tambien se aparta tr_importacion_solo_usd (0024): la importacion 50 quedo
-- confirmada en CLP de antes de esa regla, y el trigger valida la moneda en
-- CADA update, asi que rechazaria completarle el tipo de cambio. Su moneda no
-- se toca: sigue siendo un documento historico en pesos.
alter table venta       disable trigger tr_venta_confirmada_inmutable;
alter table importacion disable trigger tr_importacion_confirmada_inmutable;
alter table importacion disable trigger tr_importacion_solo_usd;

update venta
   set tipo_cambio = fn_tipo_cambio_vigente(fecha)
 where tipo_cambio is null;

update importacion
   set tipo_cambio = fn_tipo_cambio_vigente(fecha)
 where tipo_cambio is null;

alter table venta       enable trigger tr_venta_confirmada_inmutable;
alter table importacion enable trigger tr_importacion_confirmada_inmutable;
alter table importacion enable trigger tr_importacion_solo_usd;

do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
    from (select tipo_cambio from venta union all select tipo_cambio from importacion) d
   where d.tipo_cambio is null;

  if v_faltan > 0 then
    raise exception
      'Quedaron % documentos sin tipo de cambio: la tabla tipo_cambio esta vacia', v_faltan;
  end if;
end;
$$;

-- Con los documentos completos y el trigger poniendolo en cada alta, la
-- columna deja de admitir nulos: el null era justo la senal ambigua que hacia
-- que las vistas reportaran dolares como pesos.
alter table venta       alter column tipo_cambio set not null;
alter table importacion alter column tipo_cambio set not null;

comment on column venta.tipo_cambio is
  'Pesos por dolar en esta venta. Lo pone fn_documento_tipo_cambio al crearla y queda congelado.';
comment on column importacion.tipo_cambio is
  'Pesos por dolar en esta importacion. Lo pone fn_documento_tipo_cambio al crearla y queda congelado.';

create trigger tr_venta_moneda
  before insert or update on venta
  for each row execute function fn_venta_moneda();

create trigger tr_venta_tipo_cambio
  before insert or update on venta
  for each row execute function fn_documento_tipo_cambio();

create trigger tr_importacion_tipo_cambio
  before insert or update on importacion
  for each row execute function fn_documento_tipo_cambio();

-- ---------------------------------------------------------------------------
-- Las vistas dejan de adivinar la moneda
-- ---------------------------------------------------------------------------
-- Antes: `monto * coalesce(tipo_cambio, 1)`, donde el null significaba "esto
-- ya esta en pesos". Ahora el tipo de cambio esta siempre, asi que el null ya
-- no puede hacer de senal y hay que mirar la moneda, que es lo que se queria
-- preguntar desde el principio.
drop view if exists v_ventas_detalle;
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
    when mo.codigo = 'CLP'      then round(vd.cajas * vd.precio_caja, 0)
    else round(vd.cajas * vd.precio_caja * ve.tipo_cambio, 0)
  end             as monto_clp
from venta_detalle vd
join venta ve  on ve.id = vd.venta_id and ve.estado = 'CONFIRMADA'
join cliente cl on cl.id = ve.cliente_id
join producto_variante var on var.id = vd.variante_id
join producto p on p.id = var.producto_id
join moneda mo on mo.id = ve.moneda_id;

comment on view v_ventas_detalle is
  'REP-05: lineas de ventas confirmadas con cliente, producto y monto en CLP.';

drop view if exists v_valorizacion;
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
  coalesce(sum(s.cantidad), 0)     as cantidad,
  u.costo_caja,
  u.moneda,
  u.tipo_cambio,
  case
    when u.costo_caja is null then null
    when u.moneda = 'CLP'     then round(coalesce(sum(s.cantidad), 0) * u.costo_caja, 0)
    else round(coalesce(sum(s.cantidad), 0) * u.costo_caja * u.tipo_cambio, 0)
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

-- ---------------------------------------------------------------------------
-- La comision, por el mismo motivo
-- ---------------------------------------------------------------------------
-- VEN-05 calculaba la base en CLP con el mismo `coalesce(tipo_cambio, 1)`.
-- Ahora que una venta en pesos tambien lleva tipo de cambio, ese coalesce
-- multiplicaria pesos por 947.
create or replace function fn_confirmar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta      venta;
  v_detalles   int;
  v_porcentaje numeric(5, 2);
  v_moneda     text;
  v_total      numeric(14, 4);
  v_total_clp  numeric(14, 0);
begin
  if not tiene_permiso('venta.crear') then
    raise exception 'No tiene permiso para confirmar ventas';
  end if;

  select * into v_venta from venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_venta.estado <> 'BORRADOR' then
    raise exception 'La venta % ya esta confirmada', p_venta_id;
  end if;

  select count(*) into v_detalles from venta_detalle where venta_id = p_venta_id;
  if v_detalles = 0 then
    raise exception 'La venta % no tiene detalle: nada que despachar', p_venta_id;
  end if;

  insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo)
  select d.variante_id, d.zona_id, 'SALIDA', d.cajas, 'VENTA', p_venta_id,
         'Venta ' || p_venta_id
    from venta_detalle d
   where d.venta_id = p_venta_id;

  -- VEN-05: si la venta tiene vendedor, se congela su % vigente y se calcula
  -- la comision sobre el total ya convertido a CLP.
  if v_venta.vendedor_id is not null then
    select porcentaje_comision into v_porcentaje
      from vendedor where id = v_venta.vendedor_id;

    select codigo into v_moneda from moneda where id = v_venta.moneda_id;

    select coalesce(sum(d.cajas * coalesce(d.precio_caja, 0)), 0)
      into v_total
      from venta_detalle d
     where d.venta_id = p_venta_id;

    v_total_clp := round(
      case when v_moneda = 'CLP' then v_total else v_total * v_venta.tipo_cambio end, 0);

    update venta
       set estado = 'CONFIRMADA',
           confirmada_en = now(),
           confirmada_por = auth.uid(),
           comision_porcentaje = v_porcentaje,
           comision_clp = round(v_total_clp * coalesce(v_porcentaje, 0) / 100, 0)
     where id = p_venta_id;
  else
    update venta
       set estado = 'CONFIRMADA',
           confirmada_en = now(),
           confirmada_por = auth.uid()
     where id = p_venta_id;
  end if;
end;
$$;

comment on function fn_confirmar_venta is
  'VEN-02: genera las SALIDAS del detalle. VEN-05: si hay vendedor, congela su % y calcula la comision.';
