-- ---------------------------------------------------------------------------
-- 0008 · Compras / importaciones (COM-01 a COM-03)
--
-- Flujo: la importacion se digita como BORRADOR (cabecera + detalle por
-- variante), y al CONFIRMAR se generan los movimientos de ENTRADA en una sola
-- transaccion. Confirmada, no se edita: las correcciones son movimientos de
-- ajuste o anulacion, igual que el resto del kardex.
-- ---------------------------------------------------------------------------

create table importacion (
  id               bigint generated always as identity primary key,
  proveedor_id     bigint not null references proveedor(id),
  -- Documento de internacion en ZOFRI (traspaso 203) u otro respaldo aduanero.
  documento_aduana text,
  moneda_id        bigint not null references moneda(id),
  -- Tipo de cambio a CLP del dia del documento. Fijado aqui para que el costeo
  -- no cambie si la tabla tipo_cambio se corrige despues.
  tipo_cambio      numeric(14, 4) check (tipo_cambio is null or tipo_cambio > 0),
  fecha            date not null default current_date,
  estado           text not null default 'BORRADOR'
                   check (estado in ('BORRADOR', 'CONFIRMADA')),
  notas            text,
  confirmada_en    timestamptz,
  confirmada_por   uuid references usuario(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table importacion is
  'COM-01: cabecera de una importacion/compra. Solo se edita en BORRADOR.';

create table importacion_detalle (
  id             bigint generated always as identity primary key,
  importacion_id bigint not null references importacion(id),
  variante_id    bigint not null references producto_variante(id),
  zona_id        bigint not null references zona(id),
  cajas          numeric(14, 2) not null check (cajas > 0),
  -- Costo por caja en la moneda de la cabecera (COM-02).
  costo_caja     numeric(14, 4) check (costo_caja is null or costo_caja >= 0),
  created_at     timestamptz not null default now()
);

comment on table importacion_detalle is
  'COM-02: detalle por producto en cajas con costeo unitario por caja.';

create index importacion_proveedor_ix      on importacion (proveedor_id, fecha desc);
create index importacion_detalle_imp_ix    on importacion_detalle (importacion_id);
create index importacion_detalle_var_ix    on importacion_detalle (variante_id);

create trigger tr_actualizado_importacion before update on importacion
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_importacion after insert or update or delete on importacion
  for each row execute function fn_bitacora();
create trigger tr_bitacora_importacion_detalle
  after insert or update or delete on importacion_detalle
  for each row execute function fn_bitacora();

-- ---------------------------------------------------------------------------
-- Una importacion CONFIRMADA es historia: ni la cabecera ni el detalle cambian.
-- ---------------------------------------------------------------------------
create or replace function fn_importacion_solo_borrador()
returns trigger
language plpgsql
as $$
declare
  v_estado text;
  v_importacion_id bigint;
begin
  v_importacion_id := coalesce(new.importacion_id, old.importacion_id);
  select estado into v_estado from importacion where id = v_importacion_id;

  if v_estado <> 'BORRADOR' then
    raise exception 'La importacion % ya esta confirmada: su detalle no se modifica', v_importacion_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tr_detalle_solo_borrador
  before insert or update or delete on importacion_detalle
  for each row execute function fn_importacion_solo_borrador();

create or replace function fn_importacion_inmutable_confirmada()
returns trigger
language plpgsql
as $$
begin
  -- La unica transicion valida de una confirmada es... ninguna.
  if old.estado = 'CONFIRMADA' then
    raise exception 'La importacion % ya esta confirmada y no se edita', old.id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger tr_importacion_confirmada_inmutable
  before update or delete on importacion
  for each row execute function fn_importacion_inmutable_confirmada();

-- ---------------------------------------------------------------------------
-- COM-03: confirmar = ingresar a stock. Una transaccion: o entra todo, o nada.
-- ---------------------------------------------------------------------------
create or replace function fn_confirmar_importacion(p_importacion_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion importacion;
  v_detalles int;
begin
  if not tiene_permiso('importacion.crear') then
    raise exception 'No tiene permiso para confirmar importaciones';
  end if;

  select * into v_importacion from importacion where id = p_importacion_id for update;

  if v_importacion.id is null then
    raise exception 'La importacion % no existe', p_importacion_id;
  end if;
  if v_importacion.estado <> 'BORRADOR' then
    raise exception 'La importacion % ya esta confirmada', p_importacion_id;
  end if;

  select count(*) into v_detalles
    from importacion_detalle where importacion_id = p_importacion_id;
  if v_detalles = 0 then
    raise exception 'La importacion % no tiene detalle: nada que ingresar', p_importacion_id;
  end if;

  insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo)
  select d.variante_id, d.zona_id, 'ENTRADA', d.cajas, 'IMPORTACION', p_importacion_id,
         'Importacion ' || p_importacion_id
           || coalesce(' · doc ' || v_importacion.documento_aduana, '')
    from importacion_detalle d
   where d.importacion_id = p_importacion_id;

  -- El update pasa por tr_importacion_confirmada_inmutable: estado aun BORRADOR.
  update importacion
     set estado = 'CONFIRMADA',
         confirmada_en = now(),
         confirmada_por = auth.uid()
   where id = p_importacion_id;
end;
$$;

comment on function fn_confirmar_importacion is
  'COM-03: genera los movimientos de ENTRADA del detalle y sella la importacion.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table importacion         enable row level security;
alter table importacion_detalle enable row level security;

create policy importacion_lectura on importacion
  for select to authenticated using (tiene_permiso('importacion.ver'));
create policy importacion_escritura on importacion
  for all to authenticated
  using (tiene_permiso('importacion.crear')) with check (tiene_permiso('importacion.crear'));

create policy importacion_detalle_lectura on importacion_detalle
  for select to authenticated using (tiene_permiso('importacion.ver'));
create policy importacion_detalle_escritura on importacion_detalle
  for all to authenticated
  using (tiene_permiso('importacion.crear')) with check (tiene_permiso('importacion.crear'));
