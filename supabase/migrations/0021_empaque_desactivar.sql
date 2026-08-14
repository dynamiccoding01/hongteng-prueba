-- ---------------------------------------------------------------------------
-- 0021 · Un empaque con existencia no se puede desactivar (MAE-02)
--
-- `producto_variante.activo` existia desde 0003 y la base ya lo respeta:
-- fn_aplicar_movimiento rechaza cualquier movimiento sobre un empaque
-- inactivo. Lo que faltaba era poder cambiarlo, asi que en la practica un
-- empaque creado por error se quedaba para siempre en los desplegables de once
-- pantallas.
--
-- Al abrirlo aparece el riesgo obvio: si se desactiva un empaque que todavia
-- tiene cajas en alguna zona, esas cajas quedan atrapadas. No se pueden sacar
-- (el movimiento se rechaza) ni corregir. Este trigger cierra esa puerta.
--
-- Desactivar NO borra: el kardex y el historial siguen intactos, el empaque
-- deja de ofrecerse para operaciones nuevas. Es la misma baja logica del resto
-- de los maestros.
-- ---------------------------------------------------------------------------

create or replace function fn_variante_desactivar()
returns trigger
language plpgsql
as $$
declare
  v_existencia numeric(14, 2);
begin
  if old.activo and not new.activo then
    select coalesce(sum(cantidad), 0) into v_existencia
      from stock where variante_id = old.id;

    if v_existencia > 0 then
      raise exception
        'No se puede desactivar: este empaque todavia tiene % en existencia. Sáquela o traspásela primero.',
        v_existencia;
    end if;
  end if;

  return new;
end;
$$;

comment on function fn_variante_desactivar() is
  'MAE-02: impide dejar existencia atrapada en un empaque inactivo.';

create trigger tr_variante_desactivar
  before update on producto_variante
  for each row execute function fn_variante_desactivar();
