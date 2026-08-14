-- ---------------------------------------------------------------------------
-- 0023 · Precio de venta en la importacion (COM-02 / VEN-04)
--
-- Hasta ahora el costo de compra vivia en importacion_detalle.costo_caja y el
-- precio de venta en lista_precio_item, sin ninguna relacion entre ambos: nada
-- comparaba uno con otro y se podia vender bajo costo sin que el sistema
-- dijera nada.
--
-- El precio de venta se registra AQUI, en la misma linea que el costo, por una
-- razon concreta: los dos quedan en la moneda de la cabecera de la
-- importacion, asi que compararlos es exacto y no depende de ningun tipo de
-- cambio. La misma comparacion entre una compra en EUR y una lista en USD
-- exigiria convertir las dos cifras y ya no seria una verdad, sino una
-- estimacion del dia.
--
-- El precio unitario NO se guarda: es costo_caja / unidades_por_caja de la
-- variante. Guardarlo permitiria que los dos numeros se contradigan.
-- ---------------------------------------------------------------------------

alter table importacion_detalle
  add column precio_venta_caja numeric(14, 4)
    check (precio_venta_caja is null or precio_venta_caja >= 0);

comment on column importacion_detalle.precio_venta_caja is
  'VEN-04: precio de venta por caja decidido al comprar, en la moneda de la cabecera.';

-- La regla del negocio, en la base y no en un formulario: no se vende bajo
-- costo. Se admite igual (margen cero) porque "no menor" incluye la igualdad.
alter table importacion_detalle
  add constraint importacion_detalle_margen_ck
    check (
      precio_venta_caja is null
      or costo_caja is null
      or precio_venta_caja >= costo_caja
    );

-- ---------------------------------------------------------------------------
-- Confirmar ademas publica los precios de venta en la lista de esa moneda.
--
-- Cambia el tipo de retorno (void -> text) para poder decir que paso con los
-- precios, asi que hay que soltar la funcion antes: `create or replace` no
-- puede cambiar el tipo de retorno.
-- ---------------------------------------------------------------------------
drop function if exists fn_confirmar_importacion(bigint);

create function fn_confirmar_importacion(p_importacion_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion  importacion;
  v_detalles     int;
  v_con_precio   int;
  v_listas       int := 0;
  v_lista_id     bigint;
  v_lista_nombre text;
  v_actualizados int := 0;
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

  select count(*) into v_con_precio
    from importacion_detalle
   where importacion_id = p_importacion_id and precio_venta_caja is not null;

  if v_con_precio > 0 then
    -- La funcion es security definer y escribiria en lista_precio_item
    -- saltandose RLS. Hoy el unico rol que puede comprar tambien puede fijar
    -- precios, pero eso puede cambiar: se exige el permiso explicitamente.
    if not tiene_permiso('precio.editar') then
      raise exception
        'La importacion % trae precios de venta y usted no tiene permiso para fijarlos',
        p_importacion_id;
    end if;

    select count(*) into v_listas
      from lista_precio where moneda_id = v_importacion.moneda_id and activo;

    -- Solo se publica cuando no hay ambiguedad. Con dos listas activas en la
    -- misma moneda (mayorista y minorista, por ejemplo) elegir una seria
    -- adivinar, y adivinar con precios cuesta dinero.
    if v_listas = 1 then
      select id, nombre into v_lista_id, v_lista_nombre
        from lista_precio where moneda_id = v_importacion.moneda_id and activo;

      -- `distinct on` porque un mismo articulo puede venir en dos lineas de la
      -- misma importacion: sin esto, el upsert tocaria la fila dos veces y
      -- PostgreSQL lo rechaza. Gana la linea mas reciente.
      insert into lista_precio_item (lista_id, variante_id, precio_caja)
      select distinct on (d.variante_id) v_lista_id, d.variante_id, d.precio_venta_caja
        from importacion_detalle d
       where d.importacion_id = p_importacion_id and d.precio_venta_caja is not null
       order by d.variante_id, d.id desc
      on conflict (lista_id, variante_id)
      do update set precio_caja = excluded.precio_caja;

      get diagnostics v_actualizados = row_count;
    end if;
  end if;

  update importacion
     set estado = 'CONFIRMADA',
         confirmada_en = now(),
         confirmada_por = auth.uid()
   where id = p_importacion_id;

  if v_con_precio = 0 then
    return 'Mercaderia ingresada a stock';
  elsif v_listas = 1 then
    return format('Mercaderia ingresada y %s precio(s) publicados en la lista %s',
                  v_actualizados, v_lista_nombre);
  elsif v_listas = 0 then
    return 'Mercaderia ingresada. No hay lista de precios activa en esa moneda, '
        || 'asi que los precios de venta quedaron solo en la importacion';
  else
    return format('Mercaderia ingresada. Hay %s listas activas en esa moneda: '
        || 'ninguna se actualizo, fijelos desde Listas de precios', v_listas);
  end if;
end;
$$;

comment on function fn_confirmar_importacion is
  'COM-03: genera las ENTRADAS del detalle, publica los precios de venta en la lista de la misma moneda y sella la importacion.';
