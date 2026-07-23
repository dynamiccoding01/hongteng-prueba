-- ---------------------------------------------------------------------------
-- 0012 · Comisiones de vendedor (VEN-05).
--
-- INV-08 (codigo de barras/QR) no necesita cambios de esquema: las columnas
-- producto_variante.codigo_barras y .sku_interno ya existian desde el
-- Sprint 0 (migracion 0003) sin interfaz que las usara; eso se resuelve con
-- paginas nuevas, no con SQL.
-- ---------------------------------------------------------------------------

create table vendedor (
  id                 bigint generated always as identity primary key,
  usuario_id         uuid not null unique references usuario(id),
  porcentaje_comision numeric(5, 2) not null default 0
                       check (porcentaje_comision >= 0 and porcentaje_comision <= 100),
  activo             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table vendedor is
  'VEN-05: usuarios con rol de vendedor y su porcentaje de comision.';

create trigger tr_actualizado_vendedor before update on vendedor
  for each row execute function fn_set_updated_at();
create trigger tr_bitacora_vendedor after insert or update or delete on vendedor
  for each row execute function fn_bitacora();

-- La venta congela el vendedor y el porcentaje vigente al momento de
-- confirmar, igual que congela el tipo de cambio: un cambio posterior del
-- porcentaje no debe alterar comisiones ya liquidadas.
alter table venta add column vendedor_id bigint references vendedor(id);
alter table venta add column comision_porcentaje numeric(5, 2);
alter table venta add column comision_clp numeric(14, 0);

comment on column venta.comision_clp is
  'Comision calculada al confirmar, sobre el total de la venta convertido a CLP. Null si no tiene vendedor.';

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

    select coalesce(sum(d.cajas * coalesce(d.precio_caja, 0)), 0) * coalesce(v_venta.tipo_cambio, 1)
      into v_total_clp
      from venta_detalle d
     where d.venta_id = p_venta_id;

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

-- ---------------------------------------------------------------------------
-- Vista de consulta (VEN-05).
-- ---------------------------------------------------------------------------
create view v_comisiones
  with (security_invoker = true)
as
select
  v.id                 as venta_id,
  v.fecha,
  ve.id                as vendedor_id,
  u.nombre             as vendedor,
  cl.nombre            as cliente,
  v.comision_porcentaje,
  v.comision_clp
from venta v
join vendedor ve on ve.id = v.vendedor_id
join usuario  u  on u.id = ve.usuario_id
join cliente  cl on cl.id = v.cliente_id
where v.estado = 'CONFIRMADA' and v.comision_clp is not null;

comment on view v_comisiones is
  'VEN-05: comisiones por venta confirmada, con el vendedor y el % congelados en su momento.';

-- ---------------------------------------------------------------------------
-- Permisos y roles
-- ---------------------------------------------------------------------------
insert into permiso (codigo, modulo, descripcion) values
  ('vendedor.ver',    'ventas', 'Ver vendedores y su porcentaje de comision'),
  ('vendedor.editar', 'ventas', 'Administrar vendedores y comisiones'),
  ('comision.ver',    'ventas', 'Ver el reporte de comisiones')
on conflict (codigo) do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in (
  'vendedor.ver', 'vendedor.editar', 'comision.ver'
)
 where r.nombre = 'Administrador'
on conflict do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in ('vendedor.ver', 'comision.ver')
 where r.nombre = 'Ventas'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table vendedor enable row level security;

create policy vendedor_lectura on vendedor
  for select to authenticated using (tiene_permiso('vendedor.ver'));
create policy vendedor_escritura on vendedor
  for all to authenticated
  using (tiene_permiso('vendedor.editar')) with check (tiene_permiso('vendedor.editar'));
