-- ---------------------------------------------------------------------------
-- 0036 · Cierra los caminos por los que se rodeaba la RLS
--
-- La regla del proyecto es que la autorizacion de verdad vive aqui y no en la
-- aplicacion. La revision de noviembre encontro cinco sitios donde no era asi:
-- el `if` estaba en TypeScript y la base dejaba pasar a quien hablara directo
-- con la API (PostgREST) con su propia sesion, o incluso sin sesion.
--
--   S-03  Tres vistas sin `security_invoker`: corrian como su dueno y la RLS
--         de las tablas de abajo no pintaba. `/bitacora` le mostraba a
--         cualquier usuario la actividad de todos.
--   S-04  `fn_anular_movimiento` es `security definer` y no preguntaba por el
--         permiso: cualquier sesion podia mover stock anulando movimientos.
--         Ademas dejaba anular la mitad de un traspaso, una anulacion y las
--         lineas de un documento confirmado, y dos anulaciones simultaneas del
--         mismo movimiento pasaban las dos.
--   S-05  El estado de venta, importacion y toma se podia cambiar con un
--         UPDATE directo: una venta «CONFIRMADA» sin SALIDAS, sin folio y sin
--         la exigencia de precio de 0032.
--   S-06  Un INSERT directo en `movimiento` podia firmarse con otro usuario,
--         marcarse como anulacion de cualquier movimiento, o ser medio
--         traspaso o la salida de una venta que no existe.
--   S-07  Supabase concede EXECUTE sobre las funciones y SELECT sobre las
--         tablas al rol `anon`: sin sesion se podia escribir en la bitacora a
--         nombre de «sistema» y consumir folios de la serie.
--
-- Y dos reglas que salieron de revisar los controladores, porque la pagina
-- no puede ser la barrera:
--
--   T-01  Una toma de inventario aceptaba zonas de otra bodega.
--   U-01  `ultimo_acceso` solo se guardaba para quien tenia `usuario.editar`.
--
-- Guardias: `lib/seguridad/rls-api.integracion.test.ts` (G-12 ... G-17) y
-- `lib/seguridad/migraciones.regresion.test.ts` (M-03 ... M-05).
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- S-03 · Vistas con la identidad de quien consulta
--
-- Sin `security_invoker` una vista corre con los permisos de quien la creo
-- (postgres, dueno de las tablas), y el dueno no pasa por la RLS. Las de 0010 en
-- adelante ya lo llevaban; estas tres son de antes.
-- ---------------------------------------------------------------------------

alter view v_stock_variante    set (security_invoker = true);
alter view v_resumen_categoria set (security_invoker = true);

-- v_bitacora se rehace en vez de solo alterarla: con la identidad de quien
-- consulta, la RLS de `usuario` deja de mostrar a los usuarios que esa persona
-- no puede ver (un Superadmin visto por un Administrador), y el `coalesce` de
-- 0004 los pintaba como «Sistema». Un registro de una persona atribuido al
-- sistema es justo lo que una bitacora no puede decir. Ahora, si el nombre no
-- se ve, sale el correo congelado en el registro.
create or replace view v_bitacora
  with (security_invoker = true)
as
select
  b.id,
  b.created_at,
  b.usuario_id,
  b.usuario_email,
  coalesce(
    u.nombre,
    case when b.usuario_id is null then 'Sistema' else b.usuario_email end
  )                             as usuario_nombre,
  r.nombre                      as rol,
  b.accion,
  b.modulo,
  b.tabla,
  b.registro_id,
  b.campos_modificados,
  b.descripcion
from bitacora b
left join usuario u on u.id = b.usuario_id
left join rol     r on r.id = u.rol_id;

comment on view v_bitacora is
  'Bitacora para consulta: quien (nombre y rol), cuando, que accion y sobre que registro. security_invoker: la RLS de bitacora decide que filas se ven.';


-- ---------------------------------------------------------------------------
-- S-04 · Anular exige su permiso, y solo lo que se puede deshacer de a uno
-- ---------------------------------------------------------------------------
create or replace function fn_anular_movimiento(p_movimiento_id bigint, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig   movimiento;
  v_tipo   tipo_movimiento;
  v_nuevo  bigint;
begin
  -- Nuevo en 0036. La funcion se salta la RLS (security definer), asi que esta
  -- linea es la puerta: hasta ahora el permiso solo lo miraba la pagina.
  if not tiene_permiso('movimiento.anular') then
    raise exception 'No tiene permiso para anular movimientos';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indique el motivo de la anulacion';
  end if;

  -- `for update`: sin el bloqueo, dos anulaciones simultaneas del mismo
  -- movimiento pasaban las dos la comprobacion de «ya fue anulado» y el
  -- inverso se registraba dos veces.
  select * into v_orig from movimiento where id = p_movimiento_id for update;

  if v_orig.id is null then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  -- La pantalla ya escondia el boton; la base no lo impedia. Anular una
  -- anulacion vuelve a aplicar el original con otro nombre.
  if v_orig.anulado_por is not null then
    raise exception
      'El movimiento % es la anulacion de otro: no se anula, se registra el movimiento que corresponda',
      p_movimiento_id;
  end if;

  -- Un movimiento que es parte de un documento no se deshace de a uno:
  --   · TRASPASO: anular una mitad crea o destruye mercaderia (la otra mitad
  --     queda en pie).
  --   · VENTA / IMPORTACION: el documento sigue CONFIRMADO, con su folio y en
  --     los reportes, mientras el stock cuenta otra historia.
  --   · INVENTARIO: el ajuste de una toma se corrige con otra toma.
  -- Lo que queda anulable es lo que se registro a mano: entradas, salidas y
  -- ajustes sueltos, y la carga inicial.
  if v_orig.documento_tipo in ('VENTA', 'IMPORTACION', 'TRASPASO', 'INVENTARIO') then
    raise exception
      'El movimiento % pertenece a un documento (%): se corrige desde ese documento, no anulando una de sus lineas',
      p_movimiento_id, v_orig.documento_tipo;
  end if;

  if exists (select 1 from movimiento where anulado_por = p_movimiento_id) then
    raise exception 'El movimiento % ya fue anulado', p_movimiento_id;
  end if;

  v_tipo := case v_orig.tipo
    when 'ENTRADA'          then 'SALIDA'
    when 'SALIDA'           then 'ENTRADA'
    when 'AJUSTE_POSITIVO'  then 'AJUSTE_NEGATIVO'
    when 'AJUSTE_NEGATIVO'  then 'AJUSTE_POSITIVO'
    when 'TRASPASO_SALIDA'  then 'TRASPASO_ENTRADA'
    when 'TRASPASO_ENTRADA' then 'TRASPASO_SALIDA'
  end;

  insert into movimiento (
    variante_id, zona_id, tipo, cajas, documento_tipo, documento_id, motivo, anulado_por
  )
  values (
    v_orig.variante_id, v_orig.zona_id, v_tipo, v_orig.cajas,
    v_orig.documento_tipo, v_orig.documento_id,
    btrim(p_motivo),
    p_movimiento_id
  )
  returning id into v_nuevo;

  return v_nuevo;
end;
$$;

comment on function fn_anular_movimiento is
  'INV-02: anula un movimiento suelto con su inverso. Exige movimiento.anular; no anula anulaciones ni lineas de documentos.';


-- ---------------------------------------------------------------------------
-- S-05 · El sello de un documento solo lo pone su funcion
--
-- `tr_*_confirmada_inmutable` impide tocar un documento ya confirmado, pero no
-- impedia confirmarlo «a mano»: quien podia editar el borrador podia mandarle
-- `estado = 'CONFIRMADA'` y saltarse la funcion que genera los movimientos.
--
-- Como se distingue una cosa de la otra: las funciones de confirmacion son
-- `security definer` y corren como su dueno, asi que dentro de ellas
-- `current_user` no es un rol de la API. Lo que llega directo desde PostgREST
-- corre como `authenticated` (o `anon`). Lo mismo vale para los scripts y los
-- tests de integracion, que hablan como `postgres` y ya se saltan la RLS entera.
--
-- Argumentos del trigger: el estado con que nace el documento y las columnas
-- del sello. Al crear, el estado tiene que ser el inicial y las demas, nulas;
-- al editar, ninguna puede cambiar.
-- ---------------------------------------------------------------------------
create or replace function fn_sello_solo_desde_su_funcion()
returns trigger
language plpgsql
as $$
declare
  v_nuevo   jsonb := to_jsonb(new);
  v_viejo   jsonb;
  v_columna text;
  i         int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    for i in 1 .. tg_nargs - 1 loop
      v_columna := tg_argv[i];
      if v_columna = 'estado' then
        if v_nuevo ->> 'estado' is distinct from tg_argv[0] then
          raise exception
            'Un documento de % se crea en %: el estado lo cambia su funcion de confirmacion',
            tg_table_name, tg_argv[0];
        end if;
      elsif v_nuevo ->> v_columna is not null then
        raise exception
          'El campo % de % lo escribe su funcion de confirmacion: no se envia al crear',
          v_columna, tg_table_name;
      end if;
    end loop;
    return new;
  end if;

  v_viejo := to_jsonb(old);
  for i in 1 .. tg_nargs - 1 loop
    v_columna := tg_argv[i];
    if (v_nuevo -> v_columna) is distinct from (v_viejo -> v_columna) then
      raise exception
        'El campo % de % solo lo cambia su funcion de confirmacion, que es la que mueve el stock',
        v_columna, tg_table_name;
    end if;
  end loop;

  return new;
end;
$$;

comment on function fn_sello_solo_desde_su_funcion is
  'Impide que el estado y el sello de un documento (folio, confirmada_*) se escriban desde la API: solo su funcion security definer puede.';

create trigger tr_venta_sello
  before insert or update on venta
  for each row execute function fn_sello_solo_desde_su_funcion(
    'BORRADOR', 'estado', 'folio', 'confirmada_en', 'confirmada_por'
  );

create trigger tr_importacion_sello
  before insert or update on importacion
  for each row execute function fn_sello_solo_desde_su_funcion(
    'BORRADOR', 'estado', 'confirmada_en', 'confirmada_por'
  );

create trigger tr_toma_sello
  before insert or update on toma_inventario
  for each row execute function fn_sello_solo_desde_su_funcion(
    'BORRADOR', 'estado', 'aplicada_en', 'aplicada_por'
  );


-- ---------------------------------------------------------------------------
-- S-06 · Lo que se registra a mano en el kardex
--
-- La pantalla de movimientos solo inserta entradas, salidas y ajustes, sin
-- documento. La politica `movimiento_insercion` exigia el permiso pero no que
-- la fila fuera de ese tipo. Mismo criterio que el sello: lo que generan las
-- funciones (traspaso, confirmaciones, anulacion, toma) corre como su dueno y
-- no pasa por aqui.
--
-- El orden respecto de `tr_movimiento_aplicar` no importa: si esto rechaza la
-- fila, la transaccion entera se deshace, incluido el stock.
-- ---------------------------------------------------------------------------
create or replace function fn_movimiento_desde_la_api()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.tipo not in ('ENTRADA', 'SALIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO') then
    raise exception
      'Un % no se registra suelto: use el traspaso, que mueve las dos mitades juntas', new.tipo;
  end if;

  if new.anulado_por is not null then
    raise exception
      'Una anulacion se registra con fn_anular_movimiento, que comprueba el original';
  end if;

  if new.documento_id is not null or coalesce(new.documento_tipo, 'AJUSTE') <> 'AJUSTE' then
    raise exception
      'Los movimientos de un documento (%) los genera la confirmacion de ese documento',
      new.documento_tipo;
  end if;

  -- Quien y cuando no se aceptan de afuera: el kardex es la evidencia.
  -- `fn_aplicar_movimiento` hacia `coalesce(new.usuario_id, auth.uid())`, que
  -- dejaba firmar un movimiento a nombre de otra persona.
  new.usuario_id := auth.uid();
  new.fecha      := now();

  return new;
end;
$$;

comment on function fn_movimiento_desde_la_api is
  'Un movimiento insertado desde la API es una entrada, salida o ajuste suelto, firmado por quien lo inserta y con la hora del servidor.';

create trigger tr_movimiento_desde_la_api
  before insert on movimiento
  for each row execute function fn_movimiento_desde_la_api();


-- ---------------------------------------------------------------------------
-- T-01 · Una toma cuenta las zonas de SU bodega
--
-- La toma es por bodega (`toma_inventario.bodega_id`), pero el detalle
-- aceptaba cualquier zona, y la pantalla ofrecia las de todas las bodegas. Un
-- conteo cargado en la zona equivocada se aplicaba igual: ajustaba el stock de
-- una bodega que nadie habia contado, con el motivo «Toma de inventario N».
-- ---------------------------------------------------------------------------
create or replace function fn_toma_zona_de_su_bodega()
returns trigger
language plpgsql
as $$
declare
  v_bodega_toma bigint;
  v_bodega_zona bigint;
begin
  select bodega_id into v_bodega_toma from toma_inventario where id = new.toma_id;
  select bodega_id into v_bodega_zona from zona where id = new.zona_id;

  if v_bodega_toma is distinct from v_bodega_zona then
    raise exception
      'La zona % no es de la bodega de esta toma: una toma cuenta solo las zonas de su bodega',
      new.zona_id;
  end if;

  return new;
end;
$$;

create trigger tr_toma_detalle_zona_de_su_bodega
  before insert or update on toma_inventario_detalle
  for each row execute function fn_toma_zona_de_su_bodega();


-- ---------------------------------------------------------------------------
-- U-01 · Cada uno registra su propio ultimo acceso
--
-- El login hacia `update usuario set ultimo_acceso = now()`, y la unica
-- politica de escritura sobre `usuario` exige `usuario.editar`. Para todos los
-- demas la RLS filtraba el UPDATE en silencio: la columna solo se movia para
-- los administradores, y la pantalla de usuarios mostraba como «nunca entro» a
-- quien entraba todos los dias.
--
-- No se abre una politica de UPDATE sobre la propia fila: dejaria cambiarse
-- tambien `rol_id`. La funcion toca una columna de una fila, la de quien llama.
-- ---------------------------------------------------------------------------
create or replace function fn_registrar_acceso()
returns void
language sql
security definer
set search_path = public
as $$
  update usuario set ultimo_acceso = now() where id = auth.uid() and activo;
$$;

comment on function fn_registrar_acceso is
  'Marca el ultimo acceso de quien llama. security definer: la RLS de usuario no deja a cada uno escribir su fila, y no debe.';


-- ---------------------------------------------------------------------------
-- S-07 · Sin sesion no hay nada que hacer
--
-- Ninguna pantalla habla con la base sin sesion: el login usa Supabase Auth,
-- que vive en su propio esquema. Todas las politicas son `to authenticated`,
-- asi que `anon` ya no leia filas, pero si podia:
--   · ejecutar cualquier funcion `security definer` (EXECUTE es de PUBLIC por
--     omision en PostgreSQL, y Supabase ademas se lo concede a `anon`);
--   · leer las vistas que no eran `security_invoker` (S-03).
--
-- EXECUTE se le quita a PUBLIC y no solo a `anon`: `anon` lo heredaria de
-- PUBLIC. Por eso se vuelve a conceder explicitamente a `authenticated` y a
-- `service_role`. Los triggers no necesitan EXECUTE al dispararse, solo al
-- crearse.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Lo mismo para lo que creen las migraciones que vengan.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- El folio solo se pide desde dentro de las funciones que emiten documentos
-- (fn_confirmar_venta, fn_emitir_documento_traspaso), que corren como su dueno.
-- Llamado directo, cada llamada consumia un numero de la serie: un correlativo
-- con huecos no se puede defender ante nadie (0027).
revoke execute on function fn_siguiente_correlativo(text) from authenticated;

-- PostgREST guarda en cache que puede ejecutar cada rol.
notify pgrst, 'reload schema';
