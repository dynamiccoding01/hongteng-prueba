-- ---------------------------------------------------------------------------
-- 0006 · Corrige fn_aplicar_movimiento()
--
-- PROBLEMA detectado por scripts/verificar-esquema.ts:
-- La version de 0004 usaba  insert into stock ... on conflict do update.
-- PostgreSQL evalua las restricciones CHECK sobre la fila PROPUESTA antes de
-- detectar el conflicto de unicidad, de modo que una salida de 3 cajas
-- proponia insertar cajas = -3 y disparaba stock_cajas_check, aunque el saldo
-- final (7) fuera perfectamente valido. ON CONFLICT solo captura violaciones
-- de unicidad o exclusion, nunca de CHECK.
--
-- SOLUCION: intentar primero el UPDATE (que evalua el CHECK sobre el saldo
-- resultante) y solo insertar si la fila no existia. En ese caso un delta
-- negativo sigue fallando, que es justo lo que debe pasar: no se puede
-- despachar desde una zona sin existencia.
-- ---------------------------------------------------------------------------

create or replace function fn_aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factor   numeric(10, 2);
  v_signo    int;
  v_cajas    numeric(14, 2);
  v_unidades numeric(14, 2);
  v_saldo    numeric(14, 2);
begin
  select unidades_por_caja into v_factor
    from producto_variante
   where id = new.variante_id and activo;

  if v_factor is null then
    raise exception 'La variante % no existe o esta inactiva', new.variante_id;
  end if;

  v_signo := case
    when new.tipo in ('ENTRADA', 'AJUSTE_POSITIVO', 'TRASPASO_ENTRADA') then 1
    else -1
  end;

  new.unidades := new.cajas * v_factor;
  v_cajas      := v_signo * new.cajas;
  v_unidades   := v_signo * new.unidades;

  -- Bloquea la fila para serializar a usuarios concurrentes sobre la misma
  -- combinacion variante+zona, y aplica el delta sobre el saldo existente.
  update stock
     set cajas      = cajas + v_cajas,
         unidades   = unidades + v_unidades,
         updated_at = now()
   where variante_id = new.variante_id
     and zona_id     = new.zona_id
  returning cajas into v_saldo;

  -- No habia existencia previa en esa zona: se crea la fila.
  if not found then
    begin
      insert into stock (variante_id, zona_id, cajas, unidades)
      values (new.variante_id, new.zona_id, v_cajas, v_unidades)
      returning cajas into v_saldo;
    exception
      when unique_violation then
        -- Otra transaccion creo la fila entremedio: se reintenta el update.
        update stock
           set cajas      = cajas + v_cajas,
               unidades   = unidades + v_unidades,
               updated_at = now()
         where variante_id = new.variante_id
           and zona_id     = new.zona_id
        returning cajas into v_saldo;
    end;
  end if;

  new.saldo_cajas := v_saldo;
  new.usuario_id  := coalesce(new.usuario_id, auth.uid());

  return new;
end;
$$;

comment on function fn_aplicar_movimiento is
  'Aplica el movimiento al stock: convierte cajas a unidades, serializa concurrencia y deja el saldo en el kardex.';
