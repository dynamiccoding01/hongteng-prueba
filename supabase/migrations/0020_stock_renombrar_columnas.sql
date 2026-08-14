-- ---------------------------------------------------------------------------
-- 0020 · stock.cajas -> stock.cantidad, stock.unidades -> stock.total_unidades
--
-- 'cajas' y 'unidades' se leian como dos magnitudes del mismo rango. Son otra
-- cosa: 'cantidad' es cuantos empaques hay, y 'total_unidades' es el resultado
-- de multiplicar esa cantidad por unidades_por_caja. El nombre nuevo dice cual
-- es el dato y cual es el derivado.
--
-- El renombre obliga a rehacer dos clases de objetos:
--
--  * Las FUNCIONES plpgsql guardan su cuerpo como texto y no se actualizan
--    solas: si no se recrean, quedan apuntando a columnas que ya no existen y
--    fallan en el primer movimiento.
--  * Las VISTAS si sobreviven al renombre (PostgreSQL las guarda ya analizadas),
--    pero conservarian 'cajas'/'unidades' como nombre de salida. Se recrean
--    para que en todo el sistema se hable igual.
--
-- `movimiento.cajas` y `movimiento.unidades` NO cambian: ahi 'cajas' si son
-- cajas movidas en esa operacion, y el kardex es append-only.
-- ---------------------------------------------------------------------------

alter table stock rename column cajas    to cantidad;
alter table stock rename column unidades to total_unidades;

-- El renombre de columna no renombra sus restricciones.
alter table stock rename constraint stock_cajas_check    to stock_cantidad_check;
alter table stock rename constraint stock_unidades_check to stock_total_unidades_check;

comment on column stock.cantidad is
  'Cuantos empaques hay en esta zona. El dato que se cuenta en bodega.';
comment on column stock.total_unidades is
  'cantidad x producto_variante.unidades_por_caja. Derivado, lo mantiene fn_aplicar_movimiento.';
comment on constraint stock_cantidad_check on stock is
  'Barrera final contra sobregiro: si una transaccion dejaria stock negativo, falla.';

-- ---------------------------------------------------------------------------
-- Funciones: mismo comportamiento, columnas nuevas.
-- ---------------------------------------------------------------------------
create or replace function fn_aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factor   numeric(10, 2);
  v_signo    int;
  v_cajas    numeric(14, 2);
  v_unidades numeric(14, 2);
  v_saldo    numeric(14, 2);
begin
  select unidades_por_caja into v_factor
    from producto_variante
   where id = new.variante_id and activo;

  if v_factor is null then
    raise exception 'La variante % no existe o esta inactiva', new.variante_id;
  end if;

  v_signo := case
    when new.tipo in ('ENTRADA', 'AJUSTE_POSITIVO', 'TRASPASO_ENTRADA') then 1
    else -1
  end;

  new.unidades := new.cajas * v_factor;
  v_cajas      := v_signo * new.cajas;
  v_unidades   := v_signo * new.unidades;

  -- UPDATE primero: evalua el CHECK sobre el saldo resultante, no sobre la
  -- fila propuesta. Ver 0006 para el detalle del error que esto corrige.
  update stock
     set cantidad       = cantidad + v_cajas,
         total_unidades = total_unidades + v_unidades,
         updated_at     = now()
   where variante_id = new.variante_id
     and zona_id     = new.zona_id
  returning cantidad into v_saldo;

  if not found then
    begin
      insert into stock (variante_id, zona_id, cantidad, total_unidades)
      values (new.variante_id, new.zona_id, v_cajas, v_unidades)
      returning cantidad into v_saldo;
    exception
      when unique_violation then
        -- Otra transaccion creo la fila entremedio: se reintenta el update.
        update stock
           set cantidad       = cantidad + v_cajas,
               total_unidades = total_unidades + v_unidades,
               updated_at     = now()
         where variante_id = new.variante_id
           and zona_id     = new.zona_id
        returning cantidad into v_saldo;
    end;
  end if;

  new.saldo_cajas := v_saldo;
  new.usuario_id  := coalesce(new.usuario_id, auth.uid());

  return new;
end;
$$;

create or replace function fn_aplicar_toma_inventario(p_toma_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_toma       toma_inventario;
  v_detalles   int;
  v_fila       record;
  v_actual     numeric(14, 2);
  v_diferencia numeric(14, 2);
begin
  if not tiene_permiso('toma.crear') then
    raise exception 'No tiene permiso para aplicar tomas de inventario';
  end if;

  select * into v_toma from toma_inventario where id = p_toma_id for update;

  if v_toma.id is null then
    raise exception 'La toma de inventario % no existe', p_toma_id;
  end if;
  if v_toma.estado <> 'BORRADOR' then
    raise exception 'La toma de inventario % ya fue aplicada', p_toma_id;
  end if;

  select count(*) into v_detalles from toma_inventario_detalle where toma_id = p_toma_id;
  if v_detalles = 0 then
    raise exception 'La toma de inventario % no tiene conteo: nada que aplicar', p_toma_id;
  end if;

  for v_fila in
    select d.variante_id, d.zona_id, d.cajas_contadas
      from toma_inventario_detalle d
     where d.toma_id = p_toma_id
  loop
    select coalesce(s.cantidad, 0) into v_actual
      from stock s where s.variante_id = v_fila.variante_id and s.zona_id = v_fila.zona_id;
    v_actual := coalesce(v_actual, 0);
    v_diferencia := v_fila.cajas_contadas - v_actual;

    if v_diferencia > 0 then
      insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo)
      values (v_fila.variante_id, v_fila.zona_id, 'AJUSTE_POSITIVO', v_diferencia,
              'INVENTARIO', p_toma_id, 'Toma de inventario ' || p_toma_id);
    elsif v_diferencia < 0 then
      insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo)
      values (v_fila.variante_id, v_fila.zona_id, 'AJUSTE_NEGATIVO', abs(v_diferencia),
              'INVENTARIO', p_toma_id, 'Toma de inventario ' || p_toma_id);
    end if;
    -- diferencia = 0: coincide, no se genera movimiento.
  end loop;

  update toma_inventario
     set estado = 'APLICADA', aplicada_en = now(), aplicada_por = auth.uid()
   where id = p_toma_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas: se sueltan y se rehacen porque `create or replace view` no permite
-- cambiar el nombre de una columna de salida.
-- ---------------------------------------------------------------------------
drop view if exists v_stock_variante;
create view v_stock_variante as
select
  v.id                                as variante_id,
  p.id                                as producto_id,
  p.codigo,
  c.nombre_es                         as categoria,
  p.rango_tallas,
  um.codigo                           as unidad_medida,
  v.unidades_por_caja,
  coalesce(sum(s.cantidad), 0)        as cantidad,
  coalesce(sum(s.total_unidades), 0)  as total_unidades,
  string_agg(z.codigo || ' (' || s.cantidad || ')', ', ' order by z.codigo)
    filter (where s.cantidad > 0)     as zonas
from producto_variante v
join producto      p  on p.id  = v.producto_id
join categoria     c  on c.id  = p.categoria_id
join unidad_medida um on um.id = p.unidad_medida_id
left join stock s on s.variante_id = v.id
left join zona  z on z.id = s.zona_id
group by v.id, p.id, p.codigo, c.nombre_es, p.rango_tallas, um.codigo, v.unidades_por_caja;

comment on view v_stock_variante is
  'Buscador global de articulos con existencia y ubicacion (REP-03).';

drop view if exists v_resumen_categoria;
create view v_resumen_categoria as
select
  c.id                                as categoria_id,
  c.nombre_es                         as categoria,
  c.nombre_zh,
  count(distinct p.id)                as articulos,
  coalesce(sum(s.cantidad), 0)        as cantidad,
  coalesce(sum(s.total_unidades), 0)  as total_unidades
from categoria c
left join producto          p on p.categoria_id = c.id and p.activo
left join producto_variante v on v.producto_id = p.id and v.activo
left join stock             s on s.variante_id = v.id
group by c.id, c.nombre_es, c.nombre_zh;

drop view if exists v_alertas_stock;
create view v_alertas_stock
  with (security_invoker = true)
as
select
  v.id                          as variante_id,
  p.codigo,
  c.nombre_es                   as categoria,
  v.unidades_por_caja,
  v.stock_minimo,
  coalesce(sum(s.cantidad), 0)  as cantidad
from producto_variante v
join producto  p on p.id = v.producto_id
join categoria c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where v.activo and p.activo and v.stock_minimo > 0
group by v.id, p.codigo, c.nombre_es, v.unidades_por_caja, v.stock_minimo
having coalesce(sum(s.cantidad), 0) <= v.stock_minimo;

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
  -- Valor en CLP: costo x TC (si la moneda ya es CLP, TC nulo cuenta como 1).
  case
    when u.costo_caja is null then null
    else round(coalesce(sum(s.cantidad), 0) * u.costo_caja * coalesce(u.tipo_cambio, 1), 0)
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
