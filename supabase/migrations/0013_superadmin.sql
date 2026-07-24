-- ---------------------------------------------------------------------------
-- 0013 · Rol Superadmin y jerarquia de roles
--
-- Superadmin es el rol de los desarrolladores y del area de TI del cliente:
-- acceso total y por encima del Administrador. La regla clave es de SEGURIDAD,
-- no de interfaz: un Administrador (con rol.editar) NO debe poder ver, editar ni
-- asignar el rol Superadmin, y NO debe poder escalar sus propios privilegios.
-- Por eso la jerarquia se aplica aqui, en RLS, no en el React.
--
-- Dos banderas nuevas en `rol`:
--   acceso_total  el rol pasa TODOS los tiene_permiso() automaticamente; no hay
--                 que mantenerle rol_permiso y cubre los permisos futuros.
--   protegido     solo un Superadmin puede ver, editar y asignar ese rol.
-- ---------------------------------------------------------------------------

alter table rol add column acceso_total boolean not null default false;
alter table rol add column protegido    boolean not null default false;

comment on column rol.acceso_total is
  'El rol pasa todos los permisos automaticamente (tiene_permiso siempre true). Rol de desarrollo/TI.';
comment on column rol.protegido is
  'Solo un usuario con rol de acceso total puede ver, editar o asignar este rol.';

-- ---------------------------------------------------------------------------
-- es_superadmin(): true si el usuario autenticado tiene un rol de acceso total.
-- SECURITY DEFINER: corre como dueno de la funcion, asi que sus lecturas de
-- `rol`/`usuario` no pasan por RLS y no hay recursion con las politicas de abajo.
-- ---------------------------------------------------------------------------
create or replace function es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from usuario u
      join rol r on r.id = u.rol_id
     where u.id = auth.uid()
       and u.activo
       and r.acceso_total
  );
$$;

comment on function es_superadmin is
  'True si el usuario autenticado tiene un rol con acceso_total. Usada por las politicas RLS para proteger el rol Superadmin.';

-- ---------------------------------------------------------------------------
-- es_rol_protegido(): true si el rol indicado es protegido.
-- DEBE ser SECURITY DEFINER: si las politicas preguntaran "es protegido?" con un
-- subquery normal a `rol`, ese subquery pasaria por RLS y un Administrador (que
-- no ve el rol protegido) obtendria "no protegido" -> podria asignarselo por id
-- literal y escalar. Con SECURITY DEFINER la respuesta es la verdadera para todos.
-- ---------------------------------------------------------------------------
create or replace function es_rol_protegido(p_rol_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select protegido from rol where id = p_rol_id), false);
$$;

comment on function es_rol_protegido is
  'True si el rol es protegido. SECURITY DEFINER a proposito: las politicas RLS no pueden preguntarlo con un subquery normal sin abrir un hueco de escalada de privilegios.';

-- ---------------------------------------------------------------------------
-- tiene_permiso(): ahora corta en corto si el rol tiene acceso_total.
-- Un Superadmin pasa cualquier comprobacion sin necesidad de filas en
-- rol_permiso, hoy y para los permisos que se agreguen en el futuro.
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
     where u.id = auth.uid()
       and u.activo
       and (
         exists (select 1 from rol r where r.id = u.rol_id and r.acceso_total)
         or exists (
           select 1
             from rol_permiso rp
             join permiso p on p.id = rp.permiso_id
            where rp.rol_id = u.rol_id
              and p.codigo = p_codigo
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- mis_permisos(): para un rol con acceso_total devuelve TODOS los codigos, para
-- que el menu y el dashboard se le construyan completos.
-- ---------------------------------------------------------------------------
create or replace function mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  -- Rama Superadmin: todos los permisos existentes.
  select p.codigo
    from permiso p
   where exists (
     select 1 from usuario u join rol r on r.id = u.rol_id
      where u.id = auth.uid() and u.activo and r.acceso_total
   )
  union
  -- Rama normal: los permisos asignados al rol del usuario.
  select p.codigo
    from usuario u
    join rol_permiso rp on rp.rol_id = u.rol_id
    join permiso p      on p.id = rp.permiso_id
   where u.id = auth.uid()
     and u.activo;
$$;

-- ---------------------------------------------------------------------------
-- RLS: la jerarquia. Se reemplazan las politicas de rol, rol_permiso y usuario.
-- ---------------------------------------------------------------------------

-- rol: un no-superadmin no ve los roles protegidos.
drop policy rol_lectura on rol;
create policy rol_lectura on rol
  for select to authenticated
  using (not protegido or es_superadmin());

-- rol: un no-superadmin no puede editar un rol protegido, ni crear/convertir un
-- rol en protegido o de acceso total (eso seria escalar privilegios).
drop policy rol_escritura on rol;
create policy rol_escritura on rol
  for all to authenticated
  using (tiene_permiso('rol.editar') and (es_superadmin() or not protegido))
  with check (
    tiene_permiso('rol.editar')
    and (es_superadmin() or (not protegido and not acceso_total))
  );

-- rol_permiso: no se ven ni se tocan las asignaciones de un rol protegido.
drop policy rol_permiso_lectura on rol_permiso;
create policy rol_permiso_lectura on rol_permiso
  for select to authenticated
  using (es_superadmin() or not es_rol_protegido(rol_permiso.rol_id));

drop policy rol_permiso_escritura on rol_permiso;
create policy rol_permiso_escritura on rol_permiso
  for all to authenticated
  using (
    tiene_permiso('rol.editar')
    and (es_superadmin() or not es_rol_protegido(rol_permiso.rol_id))
  )
  with check (
    tiene_permiso('rol.editar')
    and (es_superadmin() or not es_rol_protegido(rol_permiso.rol_id))
  );

-- usuario: uno siempre se ve a si mismo. Ver a los demas exige usuario.ver, y
-- ademas un no-superadmin no ve a los usuarios con rol protegido (Superadmin).
drop policy usuario_ve_su_perfil on usuario;
create policy usuario_ve_su_perfil on usuario
  for select to authenticated
  using (
    id = auth.uid()
    or (
      tiene_permiso('usuario.ver')
      and (es_superadmin() or not es_rol_protegido(usuario.rol_id))
    )
  );

-- usuario: un no-superadmin no puede modificar a un usuario Superadmin (using),
-- ni asignarle a nadie un rol protegido (with check).
drop policy usuario_admin_escribe on usuario;
create policy usuario_admin_escribe on usuario
  for all to authenticated
  using (
    tiene_permiso('usuario.editar')
    and (es_superadmin() or not es_rol_protegido(usuario.rol_id))
  )
  with check (
    tiene_permiso('usuario.editar')
    and (es_superadmin() or not es_rol_protegido(usuario.rol_id))
  );

-- ---------------------------------------------------------------------------
-- El rol Superadmin. Idempotente. Sin filas en rol_permiso: acceso_total basta.
-- El primer usuario Superadmin se asigna con scripts/asignar-rol.ts (rol de
-- servicio, salta RLS): por RLS nadie puede crear un Superadmin desde la
-- interfaz sin ser ya Superadmin (el arranque no puede depender de si mismo).
-- ---------------------------------------------------------------------------
insert into rol (nombre, descripcion, acceso_total, protegido) values
  ('Superadmin', 'Acceso total. Desarrollo y area de TI/sistemas.', true, true)
on conflict (nombre) do update
  set acceso_total = excluded.acceso_total,
      protegido    = excluded.protegido,
      descripcion  = excluded.descripcion;
