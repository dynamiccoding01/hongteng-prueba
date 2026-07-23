-- ---------------------------------------------------------------------------
-- 0011 · Zona franca: empresa y correlativos (ADM-03), documentos de traspaso
-- para Aduanas (VEN-03), toma de inventario (INV-06) y refuerzo de permiso en
-- traspasos entre zonas (INV-07, la funcion fn_traspasar ya existia desde el
-- Sprint 0 pero no exigia permiso).
-- ---------------------------------------------------------------------------

alter table permiso drop constraint permiso_modulo_ck;
alter table permiso add constraint permiso_modulo_ck check (
  modulo in ('maestros', 'inventario', 'compras', 'ventas', 'reportes', 'admin', 'zona_franca')
);

-- ---------------------------------------------------------------------------
-- ADM-03 · Datos de la empresa (fila unica) y correlativos de documentos.
-- ---------------------------------------------------------------------------
create table empresa (
  id           smallint primary key default 1,
  razon_social text not null,
  rut          text,
  giro         text,
  direccion    text,
  ciudad       text,
  telefono     text,
  email        text,
  updated_at   timestamptz not null default now(),
  constraint empresa_singleton_ck check (id = 1)
);

comment on table empresa is
  'ADM-03: datos de la empresa, fila unica. RUT/giro pendientes de confirmar con el cliente.';

-- Razon social y direccion tal como aparecen en el login; RUT sin confirmar
-- (ver PLAN_AVANZE.md, "Pendientes previos al Sprint 0").
insert into empresa (id, razon_social, direccion, ciudad)
values (1, 'Hong Teng Ltda', 'Zona Franca de Iquique', 'Iquique')
on conflict (id) do nothing;

create trigger tr_actualizado_empresa before update on empresa
  for each row execute function fn_set_updated_at();
create trigger tr_bitacora_empresa after insert or update on empresa
  for each row execute function fn_bitacora();

-- Folio secuencial por tipo de documento y anio, ej. '202600784'.
create table correlativo (
  id             bigint generated always as identity primary key,
  tipo_documento text   not null,
  anio           int    not null,
  ultimo_numero  bigint not null default 0,
  constraint correlativo_uk unique (tipo_documento, anio)
);

comment on table correlativo is
  'ADM-03: folio por tipo de documento y anio. Solo lo mueve fn_siguiente_correlativo.';

create trigger tr_bitacora_correlativo after insert or update on correlativo
  for each row execute function fn_bitacora();

-- El UPDATE bloquea la fila: dos emisiones simultaneas del mismo tipo/anio se
-- serializan aqui y ninguna repite folio.
create or replace function fn_siguiente_correlativo(p_tipo_documento text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio   int := extract(year from current_date)::int;
  v_numero bigint;
begin
  insert into correlativo (tipo_documento, anio, ultimo_numero)
  values (p_tipo_documento, v_anio, 0)
  on conflict (tipo_documento, anio) do nothing;

  update correlativo
     set ultimo_numero = ultimo_numero + 1
   where tipo_documento = p_tipo_documento and anio = v_anio
  returning ultimo_numero into v_numero;

  return v_anio::text || lpad(v_numero::text, 5, '0');
end;
$$;

comment on function fn_siguiente_correlativo is
  'ADM-03: siguiente folio para un tipo de documento en el anio actual, sin repetir bajo concurrencia.';

-- ---------------------------------------------------------------------------
-- INV-07 · Traspasos entre zonas: la funcion ya existia (Sprint 0); se
-- recrea para exigir el permiso, igual que el resto de operaciones de stock.
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
  if not tiene_permiso('traspaso.crear') then
    raise exception 'No tiene permiso para traspasar mercaderia entre zonas';
  end if;
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
-- INV-06 · Toma de inventario fisico. Mismo patron BORRADOR -> APLICADA de
-- compras/ventas: se cuenta por zona y, al aplicar, la diferencia contra el
-- stock del sistema se convierte en un AJUSTE (nunca se pisa el stock a mano).
-- ---------------------------------------------------------------------------
create table toma_inventario (
  id           bigint generated always as identity primary key,
  bodega_id    bigint not null references bodega(id),
  fecha        date   not null default current_date,
  estado       text   not null default 'BORRADOR' check (estado in ('BORRADOR', 'APLICADA')),
  notas        text,
  aplicada_en  timestamptz,
  aplicada_por uuid references usuario(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table toma_inventario is
  'INV-06: toma de inventario fisico por bodega. Aplicada, genera ajustes y queda sellada.';

create table toma_inventario_detalle (
  id             bigint generated always as identity primary key,
  toma_id        bigint not null references toma_inventario(id),
  variante_id    bigint not null references producto_variante(id),
  zona_id        bigint not null references zona(id),
  cajas_contadas numeric(14, 2) not null check (cajas_contadas >= 0),
  created_at     timestamptz not null default now(),
  constraint toma_inventario_detalle_uk unique (toma_id, variante_id, zona_id)
);

comment on column toma_inventario_detalle.cajas_contadas is
  'Lo que se conto fisicamente. 0 es un resultado valido: la zona quedo sin existencia.';

create index toma_detalle_toma_ix on toma_inventario_detalle (toma_id);

create trigger tr_actualizado_toma before update on toma_inventario
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_toma after insert or update or delete on toma_inventario
  for each row execute function fn_bitacora();
create trigger tr_bitacora_toma_detalle after insert or update or delete on toma_inventario_detalle
  for each row execute function fn_bitacora();

create or replace function fn_toma_solo_borrador()
returns trigger
language plpgsql
as $$
declare
  v_estado text;
  v_toma_id bigint;
begin
  v_toma_id := coalesce(new.toma_id, old.toma_id);
  select estado into v_estado from toma_inventario where id = v_toma_id;

  if v_estado <> 'BORRADOR' then
    raise exception 'La toma de inventario % ya fue aplicada: su detalle no se modifica', v_toma_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tr_toma_detalle_solo_borrador
  before insert or update or delete on toma_inventario_detalle
  for each row execute function fn_toma_solo_borrador();

create or replace function fn_toma_inmutable_aplicada()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'APLICADA' then
    raise exception 'La toma de inventario % ya fue aplicada y no se edita', old.id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger tr_toma_aplicada_inmutable
  before update or delete on toma_inventario
  for each row execute function fn_toma_inmutable_aplicada();

-- Compara el conteo contra el stock del sistema y genera SOLO la diferencia.
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
    select coalesce(s.cajas, 0) into v_actual
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

comment on function fn_aplicar_toma_inventario is
  'INV-06: genera un AJUSTE por cada diferencia entre lo contado y el stock del sistema.';

-- ---------------------------------------------------------------------------
-- VEN-03 · Documento de traspaso de mercaderias para Aduanas (formato 203),
-- emitido desde una venta ya CONFIRMADA. Es un folio legal: no se edita ni se
-- borra, solo se anula.
-- ---------------------------------------------------------------------------
create table documento_traspaso (
  id                 bigint generated always as identity primary key,
  folio              text   not null unique,
  venta_id           bigint not null references venta(id),
  fecha              date   not null default current_date,
  adquiriente_nombre text   not null,
  adquiriente_rut    text,
  procedencia        text   not null default 'Zona Franca de Iquique',
  destino            text,
  observaciones      text,
  estado             text   not null default 'EMITIDO' check (estado in ('EMITIDO', 'ANULADO')),
  emitido_por        uuid references usuario(id),
  anulado_en         timestamptz,
  anulado_por        uuid references usuario(id),
  created_at         timestamptz not null default now(),
  constraint documento_traspaso_venta_uk unique (venta_id)
);

comment on table documento_traspaso is
  'VEN-03: traspaso de mercaderias ante Aduanas (formato 203). Un folio por venta.';

create index documento_traspaso_venta_ix on documento_traspaso (venta_id);

create trigger tr_bitacora_documento_traspaso
  after insert or update on documento_traspaso
  for each row execute function fn_bitacora();

create or replace function fn_documento_traspaso_inmutable_anulado()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'ANULADO' then
    raise exception 'El documento de traspaso % ya esta anulado y no se modifica', old.id;
  end if;
  return new;
end;
$$;

create trigger tr_documento_traspaso_inmutable
  before update on documento_traspaso
  for each row execute function fn_documento_traspaso_inmutable_anulado();

create or replace function fn_documento_traspaso_sin_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El documento de traspaso es un folio numerado ante Aduanas: no se borra, se anula';
end;
$$;

create trigger tr_documento_traspaso_sin_delete
  before delete on documento_traspaso
  for each row execute function fn_documento_traspaso_sin_delete();

create or replace function fn_emitir_documento_traspaso(
  p_venta_id bigint,
  p_adquiriente_nombre text,
  p_adquiriente_rut text default null,
  p_destino text default null,
  p_observaciones text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_venta text;
  v_folio        text;
  v_id           bigint;
begin
  if not tiene_permiso('documento_traspaso.crear') then
    raise exception 'No tiene permiso para emitir documentos de traspaso';
  end if;
  if p_adquiriente_nombre is null or btrim(p_adquiriente_nombre) = '' then
    raise exception 'Indique el nombre del adquiriente';
  end if;

  select estado into v_estado_venta from venta where id = p_venta_id;
  if v_estado_venta is null then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_estado_venta <> 'CONFIRMADA' then
    raise exception 'Solo se emite el documento de traspaso de una venta CONFIRMADA';
  end if;
  if exists (select 1 from documento_traspaso where venta_id = p_venta_id) then
    raise exception 'La venta % ya tiene un documento de traspaso', p_venta_id;
  end if;

  v_folio := fn_siguiente_correlativo('TRASPASO_203');

  insert into documento_traspaso (
    folio, venta_id, adquiriente_nombre, adquiriente_rut, destino, observaciones, emitido_por
  )
  values (
    v_folio, p_venta_id, btrim(p_adquiriente_nombre), p_adquiriente_rut, p_destino, p_observaciones,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_emitir_documento_traspaso is
  'VEN-03: emite el traspaso 203 de una venta confirmada, con folio correlativo del anio.';

create or replace function fn_anular_documento_traspaso(p_documento_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not tiene_permiso('documento_traspaso.crear') then
    raise exception 'No tiene permiso para anular documentos de traspaso';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indique el motivo de la anulacion';
  end if;

  select estado into v_estado from documento_traspaso where id = p_documento_id;
  if v_estado is null then
    raise exception 'El documento de traspaso % no existe', p_documento_id;
  end if;
  if v_estado = 'ANULADO' then
    raise exception 'El documento de traspaso % ya esta anulado', p_documento_id;
  end if;

  update documento_traspaso
     set estado = 'ANULADO', anulado_en = now(), anulado_por = auth.uid()
   where id = p_documento_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y roles
-- ---------------------------------------------------------------------------
insert into permiso (codigo, modulo, descripcion) values
  ('empresa.ver',              'admin',       'Ver los datos de la empresa'),
  ('empresa.editar',           'admin',       'Administrar los datos de la empresa'),
  ('correlativo.ver',          'admin',       'Ver el estado de los correlativos de documentos'),
  ('toma.ver',                 'inventario',  'Ver tomas de inventario'),
  ('toma.crear',               'inventario',  'Registrar y aplicar tomas de inventario'),
  ('documento_traspaso.ver',   'zona_franca', 'Ver documentos de traspaso ante Aduanas'),
  ('documento_traspaso.crear', 'zona_franca', 'Emitir y anular documentos de traspaso ante Aduanas')
on conflict (codigo) do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in (
  'empresa.ver', 'empresa.editar', 'correlativo.ver', 'toma.ver', 'toma.crear',
  'documento_traspaso.ver', 'documento_traspaso.crear'
)
 where r.nombre = 'Administrador'
on conflict do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in ('empresa.ver', 'toma.ver', 'toma.crear')
 where r.nombre = 'Bodeguero'
on conflict do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r
  join permiso p on p.codigo in ('empresa.ver', 'documento_traspaso.ver', 'documento_traspaso.crear')
 where r.nombre = 'Ventas'
on conflict do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo = 'empresa.ver'
 where r.nombre = 'Consulta'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table empresa                 enable row level security;
alter table correlativo             enable row level security;
alter table toma_inventario         enable row level security;
alter table toma_inventario_detalle enable row level security;
alter table documento_traspaso      enable row level security;

create policy empresa_lectura on empresa
  for select to authenticated using (tiene_permiso('empresa.ver'));
create policy empresa_actualizacion on empresa
  for update to authenticated using (tiene_permiso('empresa.editar')) with check (tiene_permiso('empresa.editar'));

-- correlativo solo lo mueve fn_siguiente_correlativo (SECURITY DEFINER, sin RLS).
create policy correlativo_lectura on correlativo
  for select to authenticated using (tiene_permiso('correlativo.ver'));

create policy toma_lectura on toma_inventario
  for select to authenticated using (tiene_permiso('toma.ver'));
create policy toma_escritura on toma_inventario
  for all to authenticated using (tiene_permiso('toma.crear')) with check (tiene_permiso('toma.crear'));

create policy toma_detalle_lectura on toma_inventario_detalle
  for select to authenticated using (tiene_permiso('toma.ver'));
create policy toma_detalle_escritura on toma_inventario_detalle
  for all to authenticated using (tiene_permiso('toma.crear')) with check (tiene_permiso('toma.crear'));

-- documento_traspaso solo lo mueven fn_emitir_documento_traspaso y
-- fn_anular_documento_traspaso (SECURITY DEFINER, sin RLS): es un folio legal.
create policy documento_traspaso_lectura on documento_traspaso
  for select to authenticated using (tiene_permiso('documento_traspaso.ver'));
