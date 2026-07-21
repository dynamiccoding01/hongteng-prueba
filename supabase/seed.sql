-- ---------------------------------------------------------------------------
-- Datos base del sistema. Idempotente: se puede ejecutar varias veces.
-- ---------------------------------------------------------------------------

-- Monedas y tipos de cambio observados en el software Galpon (08-06-2026)
insert into moneda (codigo, nombre, simbolo, decimales) values
  ('CLP', 'Peso chileno',       '$',   0),
  ('USD', 'Dolar estadounidense', 'US$', 2),
  ('EUR', 'Euro',               '€',   2),
  ('UF',  'Unidad de Fomento',  'UF',  4),
  ('UTM', 'Unidad Tributaria Mensual', 'UTM', 4)
on conflict (codigo) do nothing;

-- Categorias tal como estan en BODEGA.xls
insert into categoria (codigo, nombre_es, nombre_zh, unidad_medida_default) values
  ('NINO',    'Nino',    '童鞋', 'PAR'),
  ('JUVENIL', 'Juvenil', NULL,   'PAR'),
  ('ADULTO',  'Adulto',  '男鞋', 'PAR'),
  ('ROPA',    'Ropa',    '服装', 'PIEZA')
on conflict (codigo) do nothing;

-- Bodega principal (ZOFRI Iquique). Arica se agrega cuando se confirme.
insert into bodega (codigo, nombre, direccion) values
  ('IQQ', 'Iquique — ZOFRI', 'Manzana 15, Galpon 1, Zona Franca de Iquique')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Permisos del sistema
-- ---------------------------------------------------------------------------
insert into permiso (codigo, modulo, descripcion) values
  ('producto.ver',      'maestros',   'Ver el catalogo de productos'),
  ('producto.crear',    'maestros',   'Crear productos y variantes'),
  ('producto.editar',   'maestros',   'Editar productos y variantes'),
  ('categoria.ver',     'maestros',   'Ver categorias'),
  ('categoria.editar',  'maestros',   'Administrar categorias'),
  ('zona.ver',          'maestros',   'Ver bodegas y zonas'),
  ('zona.editar',       'maestros',   'Administrar bodegas y zonas'),
  ('proveedor.ver',     'maestros',   'Ver proveedores'),
  ('proveedor.editar',  'maestros',   'Administrar proveedores'),
  ('moneda.editar',     'maestros',   'Administrar monedas y tipo de cambio'),
  ('stock.ver',         'inventario', 'Consultar existencias'),
  ('movimiento.ver',    'inventario', 'Ver el kardex'),
  ('movimiento.crear',  'inventario', 'Registrar entradas, salidas y ajustes'),
  ('movimiento.anular', 'inventario', 'Anular movimientos'),
  ('traspaso.crear',    'inventario', 'Traspasar mercaderia entre zonas'),
  ('importacion.ver',   'compras',    'Ver importaciones'),
  ('importacion.crear', 'compras',    'Registrar importaciones'),
  ('reporte.ver',       'reportes',   'Ver reportes y estadisticas'),
  ('reporte.exportar',  'reportes',   'Exportar reportes a Excel o PDF'),
  ('usuario.ver',       'admin',      'Ver usuarios'),
  ('usuario.editar',    'admin',      'Administrar usuarios'),
  ('rol.editar',        'admin',      'Administrar roles y permisos'),
  ('auditoria.ver',     'admin',      'Consultar la bitacora de auditoria')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into rol (nombre, descripcion) values
  ('Administrador', 'Acceso total al sistema'),
  ('Bodeguero',     'Opera el inventario: existencias, movimientos y kardex'),
  ('Ventas',        'Consulta stock y gestiona clientes y ventas'),
  ('Consulta',      'Solo lectura. Rol por defecto de un usuario nuevo')
on conflict (nombre) do nothing;

-- Administrador: todos los permisos
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r cross join permiso p
 where r.nombre = 'Administrador'
on conflict do nothing;

-- Bodeguero: catalogo en lectura + operacion completa de inventario
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in (
  'producto.ver', 'producto.crear', 'producto.editar',
  'categoria.ver', 'zona.ver', 'proveedor.ver',
  'stock.ver', 'movimiento.ver', 'movimiento.crear', 'traspaso.crear',
  'importacion.ver', 'reporte.ver', 'reporte.exportar'
)
 where r.nombre = 'Bodeguero'
on conflict do nothing;

-- Ventas: consulta de catalogo y stock, sin tocar movimientos
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in (
  'producto.ver', 'categoria.ver', 'zona.ver',
  'stock.ver', 'movimiento.ver', 'reporte.ver', 'reporte.exportar'
)
 where r.nombre = 'Ventas'
on conflict do nothing;

-- Consulta: solo lectura
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo in (
  'producto.ver', 'categoria.ver', 'zona.ver', 'stock.ver', 'reporte.ver'
)
 where r.nombre = 'Consulta'
on conflict do nothing;
