-- ---------------------------------------------------------------------------
-- 0028 · Se quitan vendedores y comisiones (deshace VEN-05)
--
-- El cliente confirmo que no trabaja con comision por vendedor: la venta la
-- toma quien este en el mostrador y no se liquida nada sobre ella. La
-- funcionalidad se retira entera --tabla, columnas, vista y permisos-- en vez
-- de dejarla escondida, porque una columna que nadie llena es una pregunta
-- para el que lea el esquema dentro de dos anios.
--
-- Se puede borrar sin perder nada: la unica fila de `vendedor` era de prueba y
-- ninguna venta la referencia (las cinco tienen vendedor_id nulo). Si manana
-- vuelve a hacer falta, esto se reconstruye desde 0012.
--
-- La bitacora NO se toca: sus 73 registros de la tabla `vendedor` se quedan,
-- que para eso es append-only. Que la tabla ya no exista no borra que existio.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- La vista primero: depende de la tabla y de las columnas que siguen
-- ---------------------------------------------------------------------------
drop view if exists v_comisiones;

-- ---------------------------------------------------------------------------
-- Confirmar una venta vuelve a ser solo emitir y descontar
--
-- Se reescribe entera --no se puede "quitar un pedazo" a una funcion plpgsql,
-- que guarda su cuerpo como texto-- conservando lo de 0027: el folio se pide
-- DESPUES de las SALIDAS, para que un sobregiro tumbe la transaccion sin haber
-- consumido un numero de la serie.
-- ---------------------------------------------------------------------------
create or replace function fn_confirmar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta    venta;
  v_detalles int;
  v_folio    text;
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

  update venta
     set estado = 'CONFIRMADA',
         folio = v_folio,
         confirmada_en = now(),
         confirmada_por = auth.uid()
   where id = p_venta_id;
end;
$$;

comment on function fn_confirmar_venta is
  'VEN-02: genera las SALIDAS del detalle y folia la nota de venta.';

-- ---------------------------------------------------------------------------
-- Las columnas que la venta ya no necesita
-- ---------------------------------------------------------------------------
alter table venta drop column if exists comision_clp;
alter table venta drop column if exists comision_porcentaje;
alter table venta drop column if exists vendedor_id;

-- ---------------------------------------------------------------------------
-- La tabla, con sus triggers y sus politicas RLS
-- ---------------------------------------------------------------------------
drop table if exists vendedor;

-- ---------------------------------------------------------------------------
-- Permisos: primero las concesiones, despues el permiso
--
-- Sin esto, /admin/roles seguiria ofreciendo tres casillas que no gobiernan
-- ninguna pantalla.
-- ---------------------------------------------------------------------------
delete from rol_permiso
 where permiso_id in (
   select id from permiso where codigo in ('vendedor.ver', 'vendedor.editar', 'comision.ver')
 );

delete from permiso
 where codigo in ('vendedor.ver', 'vendedor.editar', 'comision.ver');
