-- ---------------------------------------------------------------------------
-- 0004 · Inventario (INV-01 a INV-04)
-- Regla heredada de BODEGA.xls:  实存 = 入库 - 出库
-- La logica que afecta stock vive AQUI, no en el cliente. Ver BACKEND.md § 6
-- ---------------------------------------------------------------------------

create type tipo_movimiento as enum (
  'ENTRADA',
  'SALIDA',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO',
  'TRASPASO_SALIDA',
  'TRASPASO_ENTRADA'
);

-- Existencia por variante y zona. Un producto puede estar repartido en varias
-- zonas: en la planilla eso se veia como '1-3 (2)M3(1)'.
create table stock (
  id          bigint generated always as identity primary key,
  variante_id bigint not null references producto_variante(id),
  zona_id     bigint not null references zona(id),
  cajas       numeric(14, 2) not null default 0 check (cajas >= 0),
  unidades    numeric(14, 2) not null default 0 check (unidades >= 0),
  updated_at  timestamptz    not null default now(),
  constraint stock_uk unique (variante_id, zona_id)
);

comment on constraint stock_cajas_check on stock is
  'Barrera final contra sobregiro: si una transaccion dejaria stock negativo, falla.';

-- Kardex (INV-03). Tabla APPEND-ONLY: no se edita ni se borra jamas.
create table movimiento (
  id             bigint generated always as identity primary key,
  variante_id    bigint not null references producto_variante(id),
  zona_id        bigint not null references zona(id),
  tipo           tipo_movimiento not null,
  cajas          numeric(14, 2) not null check (cajas > 0),
  unidades       numeric(14, 2) not null default 0,
  saldo_cajas    numeric(14, 2) not null default 0,
  documento_tipo text,
  documento_id   bigint,
  motivo         text,
  fecha          timestamptz not null default now(),
  usuario_id     uuid references usuario(id),
  anulado_por    bigint references movimiento(id),
  created_at     timestamptz not null default now(),
  constraint movimiento_documento_tipo_ck check (
    documento_tipo is null
    or documento_tipo in ('IMPORTACION', 'VENTA', 'AJUSTE', 'TRASPASO', 'INVENTARIO', 'MIGRACION')
  )
);

comment on table movimiento is
  'Kardex append-only. Un error NO se edita: se registra el movimiento inverso apuntando con anulado_por.';
comment on column movimiento.saldo_cajas is
  'Saldo de la zona despues de aplicar este movimiento. Lo calcula el trigger.';

create index movimiento_kardex_ix    on movimiento (variante_id, fecha desc);
create index movimiento_documento_ix on movimiento (documento_tipo, documento_id);
create index movimiento_zona_ix      on movimiento (zona_id, fecha desc);
create index movimiento_fecha_ix     on movimiento (fecha desc);
create index stock_variante_ix       on stock (variante_id);
create index stock_zona_ix           on stock (zona_id);

-- ---------------------------------------------------------------------------
-- Trigger: aplica el movimiento al stock.
-- - convierte cajas -> unidades usando producto_variante.unidades_por_caja (INV-04)
-- - bloquea la fila de stock (FOR UPDATE) para serializar usuarios concurrentes
-- - deja el saldo resultante en el propio movimiento (kardex auditable)
-- ---------------------------------------------------------------------------
create or replace function fn_aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factor      numeric(10, 2);
  v_signo       int;
  v_cajas       numeric(14, 2);
  v_unidades    numeric(14, 2);
  v_saldo       numeric(14, 2);
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

  -- Serializa el acceso a esta combinacion variante+zona.
  perform 1 from stock
   where variante_id = new.variante_id and zona_id = new.zona_id
     for update;

  insert into stock (variante_id, zona_id, cajas, unidades)
  values (new.variante_id, new.zona_id, v_cajas, v_unidades)
  on conflict (variante_id, zona_id) do update
     set cajas      = stock.cajas + excluded.cajas,
         unidades   = stock.unidades + excluded.unidades,
         updated_at = now()
  returning cajas into v_saldo;

  new.saldo_cajas := v_saldo;
  new.usuario_id  := coalesce(new.usuario_id, auth.uid());

  return new;
end;
$$;

create trigger tr_movimiento_aplicar
  before insert on movimiento
  for each row execute function fn_aplicar_movimiento();

-- El kardex es inmutable: cualquier intento de modificarlo falla.
create or replace function fn_movimiento_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El kardex es append-only: no se puede % un movimiento. Registre un movimiento inverso.', tg_op;
end;
$$;

create trigger tr_movimiento_sin_update before update on movimiento
  for each row execute function fn_movimiento_inmutable();
create trigger tr_movimiento_sin_delete before delete on movimiento
  for each row execute function fn_movimiento_inmutable();

-- ---------------------------------------------------------------------------
-- BITACORA (ADM-02) sobre el inventario.
-- El kardex ya guarda el detalle del movimiento; la bitacora ademas deja el
-- rastro transversal: quien lo registro y desde donde, junto al resto de las
-- acciones del sistema, para poder revisar la actividad de un usuario completa.
-- ---------------------------------------------------------------------------
create trigger tr_bitacora_movimiento after insert on movimiento
  for each row execute function fn_bitacora();

-- stock no lleva trigger: no lo escribe ningun usuario, lo deriva el trigger
-- del movimiento. Su historia es exactamente el kardex.

-- ---------------------------------------------------------------------------
-- Traspaso entre zonas (INV-07): una sola transaccion, dos movimientos.
-- ---------------------------------------------------------------------------
create or replace function fn_traspasar(
  p_variante_id bigint,
  p_zona_origen bigint,
  p_zona_destino bigint,
  p_cajas numeric,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_zona_origen = p_zona_destino then
    raise exception 'La zona de origen y destino no pueden ser la misma';
  end if;

  insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, motivo)
  values (p_variante_id, p_zona_origen, 'TRASPASO_SALIDA', p_cajas, 'TRASPASO', p_motivo);

  insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, motivo)
  values (p_variante_id, p_zona_destino, 'TRASPASO_ENTRADA', p_cajas, 'TRASPASO', p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Anulacion (INV-02): movimiento inverso, nunca DELETE.
-- ---------------------------------------------------------------------------
create or replace function fn_anular_movimiento(p_movimiento_id bigint, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig   movimiento;
  v_tipo   tipo_movimiento;
  v_nuevo  bigint;
begin
  select * into v_orig from movimiento where id = p_movimiento_id;

  if v_orig.id is null then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if exists (select 1 from movimiento where anulado_por = p_movimiento_id) then
    raise exception 'El movimiento % ya fue anulado', p_movimiento_id;
  end if;

  v_tipo := case v_orig.tipo
    when 'ENTRADA'          then 'SALIDA'
    when 'SALIDA'           then 'ENTRADA'
    when 'AJUSTE_POSITIVO'  then 'AJUSTE_NEGATIVO'
    when 'AJUSTE_NEGATIVO'  then 'AJUSTE_POSITIVO'
    when 'TRASPASO_SALIDA'  then 'TRASPASO_ENTRADA'
    when 'TRASPASO_ENTRADA' then 'TRASPASO_SALIDA'
  end;

  insert into movimiento (
    variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo, anulado_por
  )
  values (
    v_orig.variante_id, v_orig.zona_id, v_tipo, v_orig.cajas,
    v_orig.documento_tipo, v_orig.documento_id,
    coalesce(p_motivo, 'Anulacion del movimiento ' || p_movimiento_id),
    p_movimiento_id
  )
  returning id into v_nuevo;

  return v_nuevo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas de consulta (REP-01, REP-03)
-- ---------------------------------------------------------------------------

-- Existencia consolidada por variante, sumando todas las zonas.
create view v_stock_variante as
select
  v.id                          as variante_id,
  p.id                          as producto_id,
  p.codigo,
  c.nombre_es                   as categoria,
  p.rango_tallas,
  p.unidad_medida,
  v.unidades_por_caja,
  coalesce(sum(s.cajas), 0)     as cajas,
  coalesce(sum(s.unidades), 0)  as unidades,
  string_agg(z.codigo || ' (' || s.cajas || ')', ', ' order by z.codigo)
    filter (where s.cajas > 0)  as zonas
from producto_variante v
join producto  p on p.id = v.producto_id
join categoria c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
left join zona  z on z.id = s.zona_id
group by v.id, p.id, p.codigo, c.nombre_es, p.rango_tallas, p.unidad_medida, v.unidades_por_caja;

comment on view v_stock_variante is
  'Buscador global de articulos con existencia y ubicacion (REP-03).';

-- Resumen por categoria: equivalente a la hoja 汇总 de la planilla (REP-01).
create view v_resumen_categoria as
select
  c.id            as categoria_id,
  c.nombre_es     as categoria,
  c.nombre_zh,
  count(distinct p.id)          as articulos,
  coalesce(sum(s.cajas), 0)     as cajas,
  coalesce(sum(s.unidades), 0)  as unidades
from categoria c
left join producto          p on p.categoria_id = c.id and p.activo
left join producto_variante v on v.producto_id = p.id and v.activo
left join stock             s on s.variante_id = v.id
group by c.id, c.nombre_es, c.nombre_zh;

-- Bitacora legible: resuelve nombre y rol del usuario en vez del uuid (ADM-02).
create view v_bitacora as
select
  b.id,
  b.created_at,
  b.usuario_id,
  b.usuario_email,
  coalesce(u.nombre, 'Sistema') as usuario_nombre,
  r.nombre                      as rol,
  b.accion,
  b.modulo,
  b.tabla,
  b.registro_id,
  b.campos_modificados,
  b.descripcion
from bitacora b
left join usuario u on u.id = b.usuario_id
left join rol     r on r.id = u.rol_id;

comment on view v_bitacora is
  'Bitacora para consulta: quien (nombre y rol), cuando, que accion y sobre que registro.';
