-- ---------------------------------------------------------------------------
-- 0032 · Un documento no se confirma sin importe
--
-- Encontrado revisando VEN-07 y REP-07: `fn_confirmar_venta` comprobaba
-- permiso, estado y que hubiera detalle, pero no que las lineas tuvieran
-- precio. Y `fn_confirmar_importacion` tampoco exigia costo. Las dos columnas
-- son nullable a proposito —una linea se carga y el precio se pone despues—,
-- pero eso vale mientras el documento es un BORRADOR.
--
-- Lo que pasaba al confirmar sin importe no se veia en ninguna pantalla:
--
--   · La venta generaba sus SALIDA y la mercaderia se iba de bodega.
--   · `venta_detalle.subtotal` quedaba nulo (columna generada, 0029) y
--     `v_ventas_detalle.monto_clp` tambien.
--   · Las paginas de reportes suman `Number(monto_clp ?? 0)`: la linea contaba
--     como cero. Mercaderia despachada que no figuraba en ninguna cifra de
--     venta, sin ningun sitio donde se viera la diferencia.
--
-- Lo mismo en compras, y ahora ademas visible: REP-07 valoriza el periodo con
-- `v_compras_detalle.monto_clp`, que es nulo sin `costo_caja`.
--
-- La comprobacion va aqui y no en el `acciones.ts` porque confirmar es la
-- operacion que sella el documento y mueve stock: si la regla vive en la
-- pagina, cualquier otra via de confirmacion se la salta.
--
-- No toca lo ya confirmado: solo impide que vuelva a ocurrir. Los documentos
-- historicos incompletos siguen ahi, y el resumen de reportes (0033) los cuenta
-- aparte en vez de valorizarlos en cero.
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
  v_sin_precio int;
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

  -- Nuevo en 0032. Antes de mover una sola caja: una linea sin precio se
  -- despacharia y despues no habria como saber en cuanto se vendio.
  select count(*) into v_sin_precio
    from venta_detalle where venta_id = p_venta_id and precio_caja is null;
  if v_sin_precio > 0 then
    raise exception
      'La venta % tiene % linea(s) sin precio por caja: pongales precio antes de confirmar',
      p_venta_id, v_sin_precio;
  end if;

  insert into movimiento (variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo)
  select d.variante_id, d.zona_id, 'SALIDA', d.cajas, 'VENTA', p_venta_id,
         'Venta ' || p_venta_id
    from venta_detalle d
   where d.venta_id = p_venta_id;

  -- Despues de las SALIDAS: si alguna sobregira, la transaccion entera falla y
  -- el folio no se llega a consumir.
  v_folio := fn_siguiente_correlativo('NOTA_VENTA');

  update venta
     set estado = 'CONFIRMADA',
         folio = v_folio,
         confirmada_en = now(),
         confirmada_por = auth.uid()
   where id = p_venta_id;
end;
$$;

comment on function fn_confirmar_venta is
  'VEN-02: confirma la nota, exige precio en todas las lineas y genera las SALIDA en una transaccion.';

create or replace function fn_confirmar_importacion(p_importacion_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion  importacion;
  v_detalles     int;
  v_sin_costo    int;
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

  -- Nuevo en 0032, simetrico al de la venta: sin costo, la mercaderia entra a
  -- bodega sin valor y el reporte de compras (REP-07) no la puede valorizar.
  select count(*) into v_sin_costo
    from importacion_detalle
   where importacion_id = p_importacion_id and costo_caja is null;
  if v_sin_costo > 0 then
    raise exception
      'La importacion % tiene % linea(s) sin costo por caja: pongales costo antes de confirmar',
      p_importacion_id, v_sin_costo;
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
  'CMP-02: confirma la importacion, exige costo en todas las lineas, ingresa stock y publica precios.';
