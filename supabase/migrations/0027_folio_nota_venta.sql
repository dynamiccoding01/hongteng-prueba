-- ---------------------------------------------------------------------------
-- 0027 · Folio de la nota de venta (VEN-06)
--
-- La nota de venta se empieza a imprimir desde el sistema, asi que necesita un
-- numero propio. Hasta ahora el unico identificador era `venta.id`, que salta
-- (152, 158, 163) porque cuenta tambien los borradores descartados: no se lee
-- como un folio y no sirve para un documento que sale a la calle.
--
-- El folio lo da `fn_siguiente_correlativo`, el mismo mecanismo que ya usan los
-- traspasos ante Aduanas: serie por anio, formato 202600001.
--
-- Se asigna al CONFIRMAR, no al crear ni al imprimir:
--
--   · Un borrador puede quedar en nada. Darle folio al crearlo dejaria huecos
--     en la serie, y un correlativo con huecos no se puede defender ante nadie.
--   · Confirmar es lo que emite el documento y descuenta stock. Ese es el
--     momento en que la nota existe.
--   · Un borrador se imprime igual --bodega prepara el pedido con el papel en
--     la mano-- pero sale marcado PRELIMINAR y sin folio, que es exactamente
--     lo que es.
-- ---------------------------------------------------------------------------

alter table venta add column folio text unique;

comment on column venta.folio is
  'Folio de la nota de venta, serie anual (202600001). Lo asigna fn_confirmar_venta; en BORRADOR es nulo.';

-- ---------------------------------------------------------------------------
-- Confirmar ademas folia
-- ---------------------------------------------------------------------------
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
  v_folio      text;
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

  -- Despues de las SALIDAS: si alguna sobregira, la transaccion entera falla y
  -- el folio no se llega a consumir.
  v_folio := fn_siguiente_correlativo('NOTA_VENTA');

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
           folio = v_folio,
           confirmada_en = now(),
           confirmada_por = auth.uid(),
           comision_porcentaje = v_porcentaje,
           comision_clp = round(v_total_clp * coalesce(v_porcentaje, 0) / 100, 0)
     where id = p_venta_id;
  else
    update venta
       set estado = 'CONFIRMADA',
           folio = v_folio,
           confirmada_en = now(),
           confirmada_por = auth.uid()
     where id = p_venta_id;
  end if;
end;
$$;

comment on function fn_confirmar_venta is
  'VEN-02: genera las SALIDAS del detalle y folia la nota. VEN-05: si hay vendedor, congela su % y calcula la comision.';

-- ---------------------------------------------------------------------------
-- Las ventas ya confirmadas
-- ---------------------------------------------------------------------------
-- Se folian en orden de emision para que la serie quede cronologica. El sello
-- de inmutabilidad se aparta solo para esto.
alter table venta disable trigger tr_venta_confirmada_inmutable;

do $$
declare
  v_id bigint;
begin
  for v_id in
    select id from venta
     where estado = 'CONFIRMADA' and folio is null
     order by confirmada_en nulls last, id
  loop
    update venta set folio = fn_siguiente_correlativo('NOTA_VENTA') where id = v_id;
  end loop;
end;
$$;

alter table venta enable trigger tr_venta_confirmada_inmutable;
