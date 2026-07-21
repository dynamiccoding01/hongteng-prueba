-- ---------------------------------------------------------------------------
-- 0001 · Utilidades transversales
-- Funciones genericas usadas por el resto del esquema.
-- Ver BACKEND.md § 3 (Convenciones del esquema).
-- ---------------------------------------------------------------------------

-- Mantiene updated_at en toda tabla que declare el trigger.
create or replace function fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function fn_set_updated_at is
  'Trigger BEFORE UPDATE: refresca updated_at. Se declara en todas las tablas con esa columna.';

-- Bitacora generica (ADM-02). Escribe el jsonb antes/despues de cada cambio.
-- Se activa por tabla con:
--   create trigger tr_auditar_<tabla> after insert or update or delete on <tabla>
--     for each row execute function fn_auditar();
create or replace function fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id text;
begin
  v_registro_id := coalesce(
    (to_jsonb(new) ->> 'id'),
    (to_jsonb(old) ->> 'id')
  );

  insert into auditoria (usuario_id, tabla, registro_id, accion, datos_antes, datos_despues)
  values (
    auth.uid(),
    tg_table_name,
    v_registro_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

comment on function fn_auditar is
  'Trigger de auditoria: registra quien, que y cuando en la tabla auditoria (ADM-02).';
