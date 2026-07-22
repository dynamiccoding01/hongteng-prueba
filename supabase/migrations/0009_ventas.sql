-- ---------------------------------------------------------------------------
-- 0009 · Ventas (VEN-01, VEN-02, VEN-04)
--
-- Mismo patron que compras (0008): la nota de venta se digita como BORRADOR y
-- al CONFIRMAR se generan las SALIDAS de stock en una transaccion. El trigger
-- del movimiento impide vender mas de lo que hay (no existe stock negativo).
-- ---------------------------------------------------------------------------

-- Permisos del modulo (el seed historico no los traia).
insert into permiso (codigo, modulo, descripcion) values
  ('venta.ver',    'ventas', 'Ver notas de venta y listas de precios'),
  ('venta.crear',  'ventas', 'Crear y confirmar notas de venta'),
  ('precio.editar','ventas', 'Administrar listas de precios')
on conflict (codigo) do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in ('venta.ver', 'venta.crear', 'precio.editar')
 where r.nombre in ('Administrador', 'Ventas')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- VEN-04: listas de precios. Cada lista tiene moneda; el precio es por caja.
-- ---------------------------------------------------------------------------
create table lista_precio (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  moneda_id  bigint not null references moneda(id),
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lista_precio_item (
  id          bigint generated always as identity primary key,
  lista_id    bigint not null references lista_precio(id),
  variante_id bigint not null references producto_variante(id),
  precio_caja numeric(14, 4) not null check (precio_caja >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lista_precio_item_uk unique (lista_id, variante_id)
);

-- El cliente puede tener una lista asignada: es el precio sugerido al vender.
alter table cliente add column lista_precio_id bigint references lista_precio(id);

create trigger tr_actualizado_lista_precio before update on lista_precio
  for each row execute function fn_set_updated_at();
create trigger tr_actualizado_lista_precio_item before update on lista_precio_item
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_lista_precio after insert or update or delete on lista_precio
  for each row execute function fn_bitacora();
create trigger tr_bitacora_lista_precio_item after insert or update or delete on lista_precio_item
  for each row execute function fn_bitacora();

-- ---------------------------------------------------------------------------
-- VEN-01/02: nota de venta con detalle en cajas y descuento de stock.
-- ---------------------------------------------------------------------------
create table venta (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null references cliente(id),
  moneda_id      bigint not null references moneda(id),
  tipo_cambio    numeric(14, 4) check (tipo_cambio is null or tipo_cambio > 0),
  fecha          date not null default current_date,
  estado         text not null default 'BORRADOR'
                 check (estado in ('BORRADOR', 'CONFIRMADA')),
  notas          text,
  confirmada_en  timestamptz,
  confirmada_por uuid references usuario(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table venta is
  'VEN-01: nota de venta a cliente mayorista, en la moneda pactada. Solo se edita en BORRADOR.';

create table venta_detalle (
  id          bigint generated always as identity primary key,
  venta_id    bigint not null references venta(id),
  variante_id bigint not null references producto_variante(id),
  zona_id     bigint not null references zona(id),
  cajas       numeric(14, 2) not null check (cajas > 0),
  precio_caja numeric(14, 4) check (precio_caja is null or precio_caja >= 0),
  created_at  timestamptz not null default now()
);

comment on table venta_detalle is
  'VEN-02: detalle en cajas (admite fracciones para venta por unidades) con precio por caja.';

create index venta_cliente_ix     on venta (cliente_id, fecha desc);
create index venta_detalle_v_ix   on venta_detalle (venta_id);
create index venta_detalle_var_ix on venta_detalle (variante_id);

create trigger tr_actualizado_venta before update on venta
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_venta after insert or update or delete on venta
  for each row execute function fn_bitacora();
create trigger tr_bitacora_venta_detalle after insert or update or delete on venta_detalle
  for each row execute function fn_bitacora();

-- Confirmada, la venta es historia (mismo sello que la importacion).
create or replace function fn_venta_solo_borrador()
returns trigger
language plpgsql
as $$
declare
  v_estado text;
  v_venta_id bigint;
begin
  v_venta_id := coalesce(new.venta_id, old.venta_id);
  select estado into v_estado from venta where id = v_venta_id;

  if v_estado <> 'BORRADOR' then
    raise exception 'La venta % ya esta confirmada: su detalle no se modifica', v_venta_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tr_venta_detalle_solo_borrador
  before insert or update or delete on venta_detalle
  for each row execute function fn_venta_solo_borrador();

create or replace function fn_venta_inmutable_confirmada()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'CONFIRMADA' then
    raise exception 'La venta % ya esta confirmada y no se edita', old.id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger tr_venta_confirmada_inmutable
  before update or delete on venta
  for each row execute function fn_venta_inmutable_confirmada();

-- ---------------------------------------------------------------------------
-- VEN-02: confirmar = descontar stock. Si alguna linea sobregira, falla TODO.
-- ---------------------------------------------------------------------------
create or replace function fn_confirmar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta venta;
  v_detalles int;
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

  update venta
     set estado = 'CONFIRMADA',
         confirmada_en = now(),
         confirmada_por = auth.uid()
   where id = p_venta_id;
end;
$$;

comment on function fn_confirmar_venta is
  'VEN-02: genera las SALIDAS del detalle (el trigger de stock impide sobregiros) y sella la venta.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table lista_precio      enable row level security;
alter table lista_precio_item enable row level security;
alter table venta             enable row level security;
alter table venta_detalle     enable row level security;

create policy lista_precio_lectura on lista_precio
  for select to authenticated using (tiene_permiso('venta.ver'));
create policy lista_precio_escritura on lista_precio
  for all to authenticated
  using (tiene_permiso('precio.editar')) with check (tiene_permiso('precio.editar'));

create policy lista_precio_item_lectura on lista_precio_item
  for select to authenticated using (tiene_permiso('venta.ver'));
create policy lista_precio_item_escritura on lista_precio_item
  for all to authenticated
  using (tiene_permiso('precio.editar')) with check (tiene_permiso('precio.editar'));

create policy venta_lectura on venta
  for select to authenticated using (tiene_permiso('venta.ver'));
create policy venta_escritura on venta
  for all to authenticated
  using (tiene_permiso('venta.crear')) with check (tiene_permiso('venta.crear'));

create policy venta_detalle_lectura on venta_detalle
  for select to authenticated using (tiene_permiso('venta.ver'));
create policy venta_detalle_escritura on venta_detalle
  for all to authenticated
  using (tiene_permiso('venta.crear')) with check (tiene_permiso('venta.crear'));
