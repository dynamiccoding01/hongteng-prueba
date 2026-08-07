-- ---------------------------------------------------------------------------
-- 0014 · Unidad de medida como maestro administrable (MAE-07)
--
-- Hasta aqui la unidad de medida era un `create type ... as enum`, con tres
-- valores fijos: PAR, PIEZA, JUEGO. Un enum no tiene filas, asi que no habia
-- pantalla que administrar y agregar "DOCENA" exigia una migracion y un
-- despliegue. El cliente pidio poder mantener esta lista el mismo.
--
-- Pasa a ser una tabla maestra normal, como categoria o zona. Un enum y una
-- tabla no pueden llamarse igual en el mismo esquema, asi que hay que soltar el
-- tipo antes de crear la tabla; el valor actual de cada fila se guarda en una
-- columna de texto temporal para no perderlo en el camino.
--
-- OJO con `unidades_por_caja` (producto_variante): NO es esto. Aquella es la
-- cantidad que trae cada caja y el factor con el que fn_aplicar_movimiento
-- convierte cajas a unidades. Esta es en que se cuenta el articulo.
-- ---------------------------------------------------------------------------

-- 1. Preservar el valor actual como texto antes de soltar el enum.
alter table producto  add column unidad_medida_txt         text;
alter table categoria add column unidad_medida_default_txt text;

update producto  set unidad_medida_txt         = unidad_medida::text;
update categoria set unidad_medida_default_txt = unidad_medida_default::text;

-- 2. La vista lee producto.unidad_medida: se recrea al final de la migracion.
drop view if exists v_stock_variante;

-- 3. Soltar las columnas y el tipo, para dejar libre el nombre `unidad_medida`.
alter table producto  drop column unidad_medida;
alter table categoria drop column unidad_medida_default;
drop type unidad_medida;

-- ---------------------------------------------------------------------------
-- 4. El maestro
-- ---------------------------------------------------------------------------
create table unidad_medida (
  id         bigint generated always as identity primary key,
  codigo     text not null unique,
  nombre_es  text not null,
  nombre_zh  text,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unidad_medida_codigo_ck check (codigo = btrim(upper(codigo)) and length(codigo) > 0)
);

comment on table unidad_medida is
  'MAE-07 · En que se cuenta un articulo: par, pieza, juego. Lo mantiene el cliente desde la aplicacion.';
comment on column unidad_medida.codigo is
  'Siempre en mayusculas y sin espacios: PAR, PIEZA, JUEGO. Es lo que se muestra en tablas y reportes.';

-- Los tres valores que traia el enum. De aqui en adelante se agregan desde la
-- pantalla de Maestros, sin migracion.
insert into unidad_medida (codigo, nombre_es, nombre_zh) values
  ('PAR',   'Par',   '双'),
  ('PIEZA', 'Pieza', '件'),
  ('JUEGO', 'Juego', '套')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Reapuntar producto y categoria al maestro
-- ---------------------------------------------------------------------------
alter table producto  add column unidad_medida_id         bigint references unidad_medida(id);
alter table categoria add column unidad_medida_default_id bigint references unidad_medida(id);

update producto p
   set unidad_medida_id = u.id
  from unidad_medida u
 where u.codigo = p.unidad_medida_txt;

update categoria c
   set unidad_medida_default_id = u.id
  from unidad_medida u
 where u.codigo = c.unidad_medida_default_txt;

-- Red de seguridad: el enum era `not null default 'PAR'`, asi que no deberia
-- quedar ninguna fila sin correspondencia. Si la hubiera, cae en PAR y no
-- bloquea la migracion.
update producto
   set unidad_medida_id = (select id from unidad_medida where codigo = 'PAR')
 where unidad_medida_id is null;

update categoria
   set unidad_medida_default_id = (select id from unidad_medida where codigo = 'PAR')
 where unidad_medida_default_id is null;

alter table producto  alter column unidad_medida_id         set not null;
alter table categoria alter column unidad_medida_default_id set not null;

alter table producto  drop column unidad_medida_txt;
alter table categoria drop column unidad_medida_default_txt;

create index producto_unidad_medida_ix  on producto  (unidad_medida_id);
create index categoria_unidad_medida_ix on categoria (unidad_medida_default_id);

comment on column producto.unidad_medida_id is
  'En que se cuenta el articulo. No confundir con producto_variante.unidades_por_caja.';

-- ---------------------------------------------------------------------------
-- 6. Vista recreada
-- La columna se sigue llamando `unidad_medida` y sigue siendo texto: los
-- consumidores de la vista no se enteran del cambio.
-- ---------------------------------------------------------------------------
create view v_stock_variante as
select
  v.id                          as variante_id,
  p.id                          as producto_id,
  p.codigo,
  c.nombre_es                   as categoria,
  p.rango_tallas,
  um.codigo                     as unidad_medida,
  v.unidades_por_caja,
  coalesce(sum(s.cajas), 0)     as cajas,
  coalesce(sum(s.unidades), 0)  as unidades,
  string_agg(z.codigo || ' (' || s.cajas || ')', ', ' order by z.codigo)
    filter (where s.cajas > 0)  as zonas
from producto_variante v
join producto      p  on p.id  = v.producto_id
join categoria     c  on c.id  = p.categoria_id
join unidad_medida um on um.id = p.unidad_medida_id
left join stock s on s.variante_id = v.id
left join zona  z on z.id = s.zona_id
group by v.id, p.id, p.codigo, c.nombre_es, p.rango_tallas, um.codigo, v.unidades_por_caja;

comment on view v_stock_variante is
  'Buscador global de articulos con existencia y ubicacion (REP-03).';

-- ---------------------------------------------------------------------------
-- 7. updated_at y bitacora (ADM-02), obligatorios en toda tabla operativa
-- ---------------------------------------------------------------------------
create trigger tr_unidad_medida_updated_at
  before update on unidad_medida
  for each row execute function fn_set_updated_at();

create trigger tr_bitacora_unidad_medida
  after insert or update or delete on unidad_medida
  for each row execute function fn_bitacora();

-- ---------------------------------------------------------------------------
-- 8. Permisos
-- ---------------------------------------------------------------------------
insert into permiso (codigo, modulo, descripcion) values
  ('unidad.ver',    'maestros', 'Ver las unidades de medida'),
  ('unidad.editar', 'maestros', 'Administrar las unidades de medida')
on conflict (codigo) do nothing;

-- Administrador: ambos permisos.
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in ('unidad.ver', 'unidad.editar')
 where r.nombre = 'Administrador'
on conflict do nothing;

-- Los roles operativos solo la consultan: la unidad se elige al dar de alta un
-- producto, y quien puede ver el catalogo necesita leer esta lista.
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo = 'unidad.ver'
 where r.nombre in ('Bodeguero', 'Ventas', 'Consulta')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. RLS · la autorizacion de verdad
-- ---------------------------------------------------------------------------
alter table unidad_medida enable row level security;

create policy unidad_medida_lectura on unidad_medida
  for select to authenticated using (tiene_permiso('unidad.ver'));

create policy unidad_medida_escritura on unidad_medida
  for all to authenticated
  using (tiene_permiso('unidad.editar')) with check (tiene_permiso('unidad.editar'));

-- La baja normal es logica (activo = false), igual que en el resto de los
-- maestros. Un delete real lo frena la FK desde producto si la unidad esta en
-- uso, y el trigger de bitacora lo deja registrado si no lo estaba.
