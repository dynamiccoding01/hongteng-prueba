-- ---------------------------------------------------------------------------
-- 0001 · Utilidades transversales
-- Funciones genericas usadas por el resto del esquema.
-- Ver BACKEND.md § 3 (Convenciones del esquema) y § 4.2 (Bitacora).
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

-- ---------------------------------------------------------------------------
-- BITACORA (ADM-02)
--
-- Toda accion de un usuario queda registrada. El trigger toma el id del usuario
-- autenticado con auth.uid() y guarda el estado del registro antes y despues
-- del cambio, ademas de la lista de campos que efectivamente se modificaron.
--
-- Se activa en cada tabla con:
--   create trigger tr_bitacora_<tabla>
--     after insert or update or delete on <tabla>
--     for each row execute function fn_bitacora();
--
-- Si la tabla no tiene columna 'id' (clave compuesta, como rol_permiso), se le
-- pasan al trigger los nombres de las columnas que identifican la fila:
--     ... execute function fn_bitacora('rol_id', 'permiso_id');
-- ---------------------------------------------------------------------------
create or replace function fn_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id    uuid;
  v_email         text;
  v_registro_id   text;
  v_antes         jsonb;
  v_despues       jsonb;
  v_campos        text[];
begin
  v_usuario_id := auth.uid();

  -- El email se congela en la fila: si manana el usuario se da de baja, la
  -- bitacora sigue diciendo quien hizo el cambio.
  if v_usuario_id is not null then
    select email into v_email from usuario where id = v_usuario_id;
  end if;

  v_antes   := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_despues := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  -- Identificador de la fila: la columna 'id', o las columnas que el trigger
  -- indique cuando la clave es compuesta.
  if tg_nargs > 0 then
    select string_agg(coalesce(v_despues ->> clave, v_antes ->> clave), ':')
      into v_registro_id
      from unnest(tg_argv) as clave;
  else
    v_registro_id := coalesce(v_despues ->> 'id', v_antes ->> 'id');
  end if;

  -- En un UPDATE, que columnas cambiaron realmente. Evita leer dos JSON
  -- completos para descubrir que solo se toco un precio.
  if tg_op = 'UPDATE' then
    select array_agg(clave order by clave)
      into v_campos
      from jsonb_object_keys(v_despues) as clave
     where v_despues -> clave is distinct from v_antes -> clave
       and clave <> 'updated_at';

    -- Si lo unico que cambio fue updated_at, no hay nada que registrar.
    if v_campos is null then
      return new;
    end if;
  end if;

  insert into bitacora (
    usuario_id, usuario_email, tabla, registro_id, accion,
    datos_antes, datos_despues, campos_modificados
  )
  values (
    v_usuario_id,
    coalesce(v_email, 'sistema'),
    tg_table_name,
    v_registro_id,
    tg_op,
    v_antes,
    v_despues,
    v_campos
  );

  return coalesce(new, old);
end;
$$;

comment on function fn_bitacora is
  'Trigger de bitacora: registra quien (auth.uid()), que tabla, que registro, que accion y que campos cambiaron.';

-- La bitacora no se corrige ni se borra: si se pudiera, no serviria como
-- evidencia de nada.
create or replace function fn_bitacora_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La bitacora es de solo lectura: no se puede % un registro.', tg_op;
end;
$$;
