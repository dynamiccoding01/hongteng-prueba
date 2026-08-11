-- ---------------------------------------------------------------------------
-- 0019 · La cantidad de un empaque se puede corregir mientras no tenga historial
--
-- `producto_variante.unidades_por_caja` es el factor con el que
-- fn_aplicar_movimiento convierte cajas a unidades. Cada movimiento ya aplicado
-- dejo su resultado congelado en movimiento.unidades y acumulado en
-- stock.unidades: cambiar el factor despues no recalcula nada, solo deja el
-- stock sin cuadrar con el kardex, y sin avisar.
--
-- Pero mientras el empaque NO tiene movimientos no hay nada que descuadrar, y
-- ese es el caso real: alguien se equivoco al dar de alta el articulo. Antes
-- habia que crear un empaque nuevo y convivir con el error.
--
-- La regla queda aqui y no en el acciones.ts porque es la que protege el stock:
-- da igual si el cambio llega desde la pantalla, desde un script o desde el
-- editor SQL del panel.
-- ---------------------------------------------------------------------------

create or replace function fn_variante_cantidad_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.unidades_por_caja is distinct from old.unidades_por_caja
     and exists (select 1 from movimiento where variante_id = old.id) then
    raise exception
      'Este empaque ya tiene movimientos registrados: su cantidad por caja no se puede cambiar. Use «Agregar empaque» para registrar otra presentacion.';
  end if;

  return new;
end;
$$;

comment on function fn_variante_cantidad_inmutable() is
  'MAE-02: la cantidad por caja solo se corrige mientras el empaque no tenga kardex.';

create trigger tr_variante_cantidad_inmutable
  before update on producto_variante
  for each row execute function fn_variante_cantidad_inmutable();
