-- ---------------------------------------------------------------------------
-- 0002 · Seguridad y bitacora (ADM-01, ADM-02)
-- Cadena de autorizacion:  usuario --> rol --> rol_permiso <-- permiso
-- Ver BACKEND.md § 4.1
-- ---------------------------------------------------------------------------

create table rol (
  id          bigint generated always as identity primary key,
  nombre      text        not null unique,
  descripcion text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table rol is 'Perfil de acceso. Un usuario tiene exactamente un rol.';

create table permiso (
  id          bigint generated always as identity primary key,
  codigo      text not null unique,
  modulo      text not null,
  descripcion text not null,
  created_at  timestamptz not null default now(),
  constraint permiso_codigo_formato_ck check (codigo ~ '^[a-z_]+\.[a-z_]+$'),
  constraint permiso_modulo_ck check (
    modulo in ('maestros', 'inventario', 'compras', 'ventas', 'reportes', 'admin')
  )
);

comment on column permiso.codigo is
  'Accion concreta en formato recurso.accion, ej. producto.crear, movimiento.anular.';

-- Tabla intermedia: un rol tiene muchos permisos y un permiso esta en muchos roles.
create table rol_permiso (
  rol_id     bigint not null references rol(id)     on delete cascade,
  permiso_id bigint not null references permiso(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rol_id, permiso_id)
);

comment on table rol_permiso is
  'Intermedia rol <-> permiso. Cambiar lo que puede hacer un perfil = editar filas aqui.';

create table usuario (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text        not null,
  email         text        not null unique,
  rol_id        bigint      not null references rol(id),
  activo        boolean     not null default true,
  ultimo_acceso timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table usuario is 'Extiende auth.users de Supabase con nombre y rol del sistema.';

-- ---------------------------------------------------------------------------
-- BITACORA (ADM-02)
-- Toda accion que hace un usuario queda registrada aqui, con su id.
-- Es append-only: no se edita ni se borra.
-- ---------------------------------------------------------------------------
create table bitacora (
  id                 bigint generated always as identity primary key,
  usuario_id         uuid references usuario(id),
  usuario_email      text not null default 'sistema',
  tabla              text,
  registro_id        text,
  accion             text not null,
  modulo             text,
  descripcion        text,
  datos_antes        jsonb,
  datos_despues      jsonb,
  campos_modificados text[],
  ip                 inet,
  user_agent         text,
  created_at         timestamptz not null default now(),
  constraint bitacora_accion_ck check (accion in (
    -- cambios sobre tablas (los escribe el trigger fn_bitacora)
    'INSERT', 'UPDATE', 'DELETE',
    -- acciones de la aplicacion (las escribe registrar_en_bitacora)
    'LOGIN', 'LOGOUT', 'LOGIN_FALLIDO', 'EXPORTAR', 'IMPRIMIR',
    'ANULAR', 'CONFIRMAR', 'MIGRAR', 'RESPALDAR'
  ))
);

comment on table bitacora is
  'Registro de toda accion de usuario (ADM-02). usuario_id dice QUIEN, created_at CUANDO, datos_antes/despues QUE cambio.';
comment on column bitacora.usuario_id is
  'Usuario autenticado que ejecuto la accion. NULL solo en procesos del sistema (migracion inicial).';
comment on column bitacora.usuario_email is
  'Email congelado al momento de la accion: el rastro sobrevive aunque el usuario se elimine.';
comment on column bitacora.campos_modificados is
  'En un UPDATE, solo las columnas que realmente cambiaron.';

create index bitacora_usuario_ix         on bitacora (usuario_id, created_at desc);
create index bitacora_tabla_registro_ix  on bitacora (tabla, registro_id);
create index bitacora_created_at_ix      on bitacora (created_at desc);
create index bitacora_accion_ix          on bitacora (accion);
create index usuario_rol_ix              on usuario (rol_id);
create index rol_permiso_permiso_ix      on rol_permiso (permiso_id);

-- La bitacora es evidencia: solo admite INSERT.
create trigger tr_bitacora_sin_update before update on bitacora
  for each row execute function fn_bitacora_inmutable();
create trigger tr_bitacora_sin_delete before delete on bitacora
  for each row execute function fn_bitacora_inmutable();

-- ---------------------------------------------------------------------------
-- Registro de acciones que no son cambios de tabla: inicio de sesion,
-- exportaciones, impresiones. La llama la aplicacion.
-- ---------------------------------------------------------------------------
create or replace function registrar_en_bitacora(
  p_accion      text,
  p_modulo      text default null,
  p_descripcion text default null,
  p_tabla       text default null,
  p_registro_id text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    bigint;
begin
  select email into v_email from usuario where id = auth.uid();

  insert into bitacora (usuario_id, usuario_email, accion, modulo, descripcion, tabla, registro_id)
  values (auth.uid(), coalesce(v_email, 'sistema'), p_accion, p_modulo, p_descripcion,
          p_tabla, p_registro_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function registrar_en_bitacora is
  'Registra en la bitacora una accion de aplicacion (LOGIN, EXPORTAR, IMPRIMIR...) que no es un cambio de tabla.';

create trigger tr_rol_updated_at     before update on rol     for each row execute function fn_set_updated_at();
create trigger tr_usuario_updated_at before update on usuario for each row execute function fn_set_updated_at();

-- Bitacora sobre las tablas de seguridad: cambiar un rol o un permiso es
-- justamente lo que mas interesa poder auditar.
create trigger tr_bitacora_rol         after insert or update or delete on rol
  for each row execute function fn_bitacora();
create trigger tr_bitacora_permiso     after insert or update or delete on permiso
  for each row execute function fn_bitacora();
-- rol_permiso tiene clave compuesta: se le indican las columnas que identifican la fila.
create trigger tr_bitacora_rol_permiso after insert or update or delete on rol_permiso
  for each row execute function fn_bitacora('rol_id', 'permiso_id');
create trigger tr_bitacora_usuario     after insert or update or delete on usuario
  for each row execute function fn_bitacora();

-- ---------------------------------------------------------------------------
-- Verificacion de permisos EN LA BASE DE DATOS, no solo en la interfaz.
-- Resuelve usuario -> rol -> rol_permiso -> permiso para el usuario autenticado.
-- ---------------------------------------------------------------------------
create or replace function tiene_permiso(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from usuario u
      join rol_permiso rp on rp.rol_id = u.rol_id
      join permiso p      on p.id = rp.permiso_id
     where u.id = auth.uid()
       and u.activo
       and p.codigo = p_codigo
  );
$$;

comment on function tiene_permiso is
  'True si el usuario autenticado tiene el permiso indicado. Usada por las politicas RLS.';

-- Devuelve todos los permisos del usuario autenticado (para pintar el menu).
create or replace function mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo
    from usuario u
    join rol_permiso rp on rp.rol_id = u.rol_id
    join permiso p      on p.id = rp.permiso_id
   where u.id = auth.uid()
     and u.activo;
$$;

-- Alta automatica del perfil al registrarse en Supabase Auth.
create or replace function fn_crear_usuario_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol_id bigint;
begin
  -- Rol por defecto: el de menor privilegio. Un administrador lo reasigna despues.
  select id into v_rol_id from rol where nombre = 'Consulta' limit 1;

  if v_rol_id is null then
    raise exception 'No existe el rol por defecto "Consulta". Ejecute supabase/seed.sql.';
  end if;

  insert into usuario (id, nombre, email, rol_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    v_rol_id
  );

  return new;
end;
$$;

create trigger tr_auth_user_creado
  after insert on auth.users
  for each row execute function fn_crear_usuario_desde_auth();
