-- ---------------------------------------------------------------------------
-- MAE-06: maestro de clientes.
-- Compradores de la empresa (mayoristas de ZOFRI y del resto de Chile).
-- Mismo patron que proveedor: RLS por permiso + trigger de bitacora.
-- ---------------------------------------------------------------------------

create table cliente (
  id         bigint generated always as identity primary key,
  codigo     text not null unique,
  nombre     text not null,
  rut        text unique,
  contacto   text,
  email      text,
  telefono   text,
  direccion  text,
  ciudad     text,
  pais       text not null default 'CL',
  notas      text,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table cliente is 'MAE-06: clientes (compradores). El RUT es unico cuando se informa.';
comment on column cliente.rut is 'RUT chileno con digito verificador, ej. 76.123.456-7. Opcional: hay clientes extranjeros.';

create trigger tr_actualizado_cliente before update on cliente
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_cliente after insert or update or delete on cliente
  for each row execute function fn_bitacora();

-- ---------------------------------------------------------------------------
-- Permisos del modulo y asignacion a roles
-- ---------------------------------------------------------------------------
insert into permiso (codigo, modulo, descripcion) values
  ('cliente.ver',    'maestros', 'Ver clientes'),
  ('cliente.editar', 'maestros', 'Administrar clientes')
on conflict (codigo) do nothing;

-- Administrador: todo. Ventas: gestiona clientes (asi lo describe su rol).
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in ('cliente.ver', 'cliente.editar')
 where r.nombre in ('Administrador', 'Ventas')
on conflict do nothing;

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo = 'cliente.ver'
 where r.nombre = 'Consulta'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table cliente enable row level security;

create policy cliente_lectura on cliente
  for select to authenticated using (tiene_permiso('cliente.ver'));
create policy cliente_escritura on cliente
  for all to authenticated
  using (tiene_permiso('cliente.editar')) with check (tiene_permiso('cliente.editar'));
