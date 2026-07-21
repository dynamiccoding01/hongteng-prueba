-- ---------------------------------------------------------------------------
-- 0003 · Catalogo y maestros (MAE-01 a MAE-06)
-- Atributos derivados del analisis real de BODEGA.xls. Ver BACKEND.md § 2 y § 4.2
-- ---------------------------------------------------------------------------

-- Calzado se cuenta en pares (双数); ropa en piezas (件数). No se asume una sola unidad.
create type unidad_medida as enum ('PAR', 'PIEZA', 'JUEGO');

create table moneda (
  id        bigint generated always as identity primary key,
  codigo    text not null unique,
  nombre    text not null,
  simbolo   text,
  decimales smallint not null default 2 check (decimales between 0 and 6),
  activo    boolean  not null default true
);

create table tipo_cambio (
  id         bigint generated always as identity primary key,
  moneda_id  bigint not null references moneda(id),
  fecha      date   not null,
  valor      numeric(14, 4) not null check (valor > 0),
  fuente     text,
  created_at timestamptz not null default now(),
  constraint tipo_cambio_uk unique (moneda_id, fecha)
);

comment on table tipo_cambio is
  'Historico diario. Los documentos CONGELAN el valor usado: nunca se recalcula un documento emitido.';

create table categoria (
  id                     bigint generated always as identity primary key,
  codigo                 text not null unique,
  nombre_es              text not null,
  nombre_zh              text,
  unidad_medida_default  unidad_medida not null default 'PAR',
  activo                 boolean     not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table proveedor (
  id         bigint generated always as identity primary key,
  codigo     text not null unique,
  nombre     text not null,
  nombre_zh  text,
  pais       text not null default 'CN',
  contacto   text,
  email      text,
  telefono   text,
  direccion  text,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bodega (
  id         bigint generated always as identity primary key,
  codigo     text not null unique,
  nombre     text not null,
  direccion  text,
  activo     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table bodega is 'Recinto fisico. La operacion actual usa Iquique y Arica.';

-- 区域 · Ubicacion fisica dentro de la bodega. En la planilla son texto libre
-- ('1-4', 'M2-4', '3-8'); aqui quedan normalizadas como maestro (MAE-04).
create table zona (
  id          bigint generated always as identity primary key,
  bodega_id   bigint not null references bodega(id),
  codigo      text   not null,
  descripcion text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint zona_codigo_uk unique (bodega_id, codigo)
);

-- Ubicacion declarada ante ZOFRI (columna ZETA en el software Galpon).
create table ubicacion_zeta (
  id          bigint generated always as identity primary key,
  codigo      text not null unique,
  descripcion text,
  activo      boolean not null default true
);

-- 货号 · Articulo de fabrica.
create table producto (
  id             bigint generated always as identity primary key,
  codigo         text   not null,
  categoria_id   bigint not null references categoria(id),
  descripcion_es text,
  descripcion_zh text,
  rango_tallas   text,
  talla_desde    text,
  talla_hasta    text,
  unidad_medida  unidad_medida not null default 'PAR',
  marca          text,
  genero         text,
  temporada      text,
  proveedor_id   bigint references proveedor(id),
  imagen_url     text,
  observacion    text,
  activo         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references usuario(id),
  updated_by     uuid references usuario(id),
  constraint producto_codigo_categoria_uk unique (codigo, categoria_id),
  -- Hay codigos numericos en la planilla ('80013', '308'): se guardan como texto y sin espacios.
  constraint producto_codigo_ck check (codigo = btrim(codigo) and length(codigo) > 0)
);

comment on column producto.codigo is '货号 · SIEMPRE text. Hay codigos numericos como 80013 y 308.';
comment on column producto.rango_tallas is
  '码段 tal como viene del cliente: 31-36, M-2XL, 3XL-7XL, 8+16. Fuente de verdad.';
comment on column producto.talla_desde is 'Derivado de rango_tallas, solo para filtrar. Puede ser null.';

-- 双数 / 件数 · Presentacion. Un mismo codigo viene en cajas de distinta cantidad:
-- LB23020 existe con 600 y con 1200 piezas por caja (MAE-02).
create table producto_variante (
  id                bigint generated always as identity primary key,
  producto_id       bigint not null references producto(id),
  unidades_por_caja numeric(10, 2) not null check (unidades_por_caja > 0),
  codigo_barras     text unique,
  sku_interno       text unique,
  stock_minimo      numeric(14, 2) not null default 0 check (stock_minimo >= 0),
  activo            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint producto_variante_uk unique (producto_id, unidades_por_caja)
);

comment on table producto_variante is
  'Empaque del articulo. El stock y los movimientos apuntan SIEMPRE a la variante, nunca al producto.';

create index producto_codigo_ix       on producto (codigo);
create index producto_categoria_ix    on producto (categoria_id);
create index producto_proveedor_ix    on producto (proveedor_id);
create index variante_producto_ix     on producto_variante (producto_id);
create index zona_bodega_ix           on zona (bodega_id);
create index tipo_cambio_fecha_ix     on tipo_cambio (fecha desc);

-- updated_at automatico en todos los maestros
create trigger tr_categoria_updated_at  before update on categoria         for each row execute function fn_set_updated_at();
create trigger tr_proveedor_updated_at  before update on proveedor         for each row execute function fn_set_updated_at();
create trigger tr_bodega_updated_at     before update on bodega            for each row execute function fn_set_updated_at();
create trigger tr_zona_updated_at       before update on zona              for each row execute function fn_set_updated_at();
create trigger tr_producto_updated_at   before update on producto          for each row execute function fn_set_updated_at();
create trigger tr_variante_updated_at   before update on producto_variante for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- BITACORA (ADM-02) sobre TODOS los maestros.
-- Cualquier alta, cambio o baja queda registrada con el id del usuario que la hizo.
-- ---------------------------------------------------------------------------
create trigger tr_bitacora_moneda         after insert or update or delete on moneda
  for each row execute function fn_bitacora();
create trigger tr_bitacora_tipo_cambio    after insert or update or delete on tipo_cambio
  for each row execute function fn_bitacora();
create trigger tr_bitacora_categoria      after insert or update or delete on categoria
  for each row execute function fn_bitacora();
create trigger tr_bitacora_proveedor      after insert or update or delete on proveedor
  for each row execute function fn_bitacora();
create trigger tr_bitacora_bodega         after insert or update or delete on bodega
  for each row execute function fn_bitacora();
create trigger tr_bitacora_zona           after insert or update or delete on zona
  for each row execute function fn_bitacora();
create trigger tr_bitacora_ubicacion_zeta after insert or update or delete on ubicacion_zeta
  for each row execute function fn_bitacora();
create trigger tr_bitacora_producto       after insert or update or delete on producto
  for each row execute function fn_bitacora();
create trigger tr_bitacora_variante       after insert or update or delete on producto_variante
  for each row execute function fn_bitacora();
