-- ---------------------------------------------------------------------------
-- 0005 · Row Level Security
-- REGLA: toda tabla lleva RLS habilitado. Una tabla sin politica es una tabla publica.
-- La autorizacion se resuelve con tiene_permiso(), que recorre
-- usuario -> rol -> rol_permiso -> permiso.
-- ---------------------------------------------------------------------------

alter table rol               enable row level security;
alter table permiso           enable row level security;
alter table rol_permiso       enable row level security;
alter table usuario           enable row level security;
alter table bitacora          enable row level security;
alter table moneda            enable row level security;
alter table tipo_cambio       enable row level security;
alter table categoria         enable row level security;
alter table proveedor         enable row level security;
alter table bodega            enable row level security;
alter table zona              enable row level security;
alter table ubicacion_zeta    enable row level security;
alter table producto          enable row level security;
alter table producto_variante enable row level security;
alter table stock             enable row level security;
alter table movimiento        enable row level security;

-- ---------------------------------------------------------------------------
-- Perfil propio: todo usuario autenticado puede leerse a si mismo (para el menu).
-- ---------------------------------------------------------------------------
create policy usuario_ve_su_perfil on usuario
  for select to authenticated
  using (id = auth.uid() or tiene_permiso('usuario.ver'));

create policy usuario_admin_escribe on usuario
  for all to authenticated
  using (tiene_permiso('usuario.editar'))
  with check (tiene_permiso('usuario.editar'));

-- ---------------------------------------------------------------------------
-- Roles y permisos: lectura para cualquier autenticado (necesaria para resolver
-- el menu); escritura solo con permiso de administracion.
-- ---------------------------------------------------------------------------
create policy rol_lectura on rol
  for select to authenticated using (true);
create policy rol_escritura on rol
  for all to authenticated
  using (tiene_permiso('rol.editar')) with check (tiene_permiso('rol.editar'));

create policy permiso_lectura on permiso
  for select to authenticated using (true);

create policy rol_permiso_lectura on rol_permiso
  for select to authenticated using (true);
create policy rol_permiso_escritura on rol_permiso
  for all to authenticated
  using (tiene_permiso('rol.editar')) with check (tiene_permiso('rol.editar'));

-- ---------------------------------------------------------------------------
-- BITACORA (ADM-02)
-- Solo lectura, y solo con permiso. Nadie la escribe ni la borra desde la
-- aplicacion: la alimentan los triggers y registrar_en_bitacora(), ambos
-- SECURITY DEFINER. Ademas hay triggers que rechazan UPDATE y DELETE.
--
-- Todo usuario puede ver SU PROPIA actividad; ver la de los demas requiere el
-- permiso bitacora.ver.
-- ---------------------------------------------------------------------------
create policy bitacora_lectura on bitacora
  for select to authenticated
  using (usuario_id = auth.uid() or tiene_permiso('bitacora.ver'));

-- ---------------------------------------------------------------------------
-- Maestros
-- ---------------------------------------------------------------------------
create policy categoria_lectura on categoria
  for select to authenticated using (tiene_permiso('categoria.ver'));
create policy categoria_escritura on categoria
  for all to authenticated
  using (tiene_permiso('categoria.editar')) with check (tiene_permiso('categoria.editar'));

create policy proveedor_lectura on proveedor
  for select to authenticated using (tiene_permiso('proveedor.ver'));
create policy proveedor_escritura on proveedor
  for all to authenticated
  using (tiene_permiso('proveedor.editar')) with check (tiene_permiso('proveedor.editar'));

create policy bodega_lectura on bodega
  for select to authenticated using (tiene_permiso('zona.ver'));
create policy bodega_escritura on bodega
  for all to authenticated
  using (tiene_permiso('zona.editar')) with check (tiene_permiso('zona.editar'));

create policy zona_lectura on zona
  for select to authenticated using (tiene_permiso('zona.ver'));
create policy zona_escritura on zona
  for all to authenticated
  using (tiene_permiso('zona.editar')) with check (tiene_permiso('zona.editar'));

create policy zeta_lectura on ubicacion_zeta
  for select to authenticated using (tiene_permiso('zona.ver'));
create policy zeta_escritura on ubicacion_zeta
  for all to authenticated
  using (tiene_permiso('zona.editar')) with check (tiene_permiso('zona.editar'));

create policy moneda_lectura on moneda
  for select to authenticated using (true);
create policy moneda_escritura on moneda
  for all to authenticated
  using (tiene_permiso('moneda.editar')) with check (tiene_permiso('moneda.editar'));

create policy tipo_cambio_lectura on tipo_cambio
  for select to authenticated using (true);
create policy tipo_cambio_escritura on tipo_cambio
  for all to authenticated
  using (tiene_permiso('moneda.editar')) with check (tiene_permiso('moneda.editar'));

-- ---------------------------------------------------------------------------
-- Catalogo
-- ---------------------------------------------------------------------------
create policy producto_lectura on producto
  for select to authenticated using (tiene_permiso('producto.ver'));
create policy producto_insercion on producto
  for insert to authenticated with check (tiene_permiso('producto.crear'));
create policy producto_edicion on producto
  for update to authenticated
  using (tiene_permiso('producto.editar')) with check (tiene_permiso('producto.editar'));
-- Sin politica de DELETE: los productos se dan de baja con activo = false.

create policy variante_lectura on producto_variante
  for select to authenticated using (tiene_permiso('producto.ver'));
create policy variante_insercion on producto_variante
  for insert to authenticated with check (tiene_permiso('producto.crear'));
create policy variante_edicion on producto_variante
  for update to authenticated
  using (tiene_permiso('producto.editar')) with check (tiene_permiso('producto.editar'));

-- ---------------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------------
create policy stock_lectura on stock
  for select to authenticated using (tiene_permiso('stock.ver'));
-- stock NO se escribe desde la aplicacion: lo mantiene el trigger del movimiento.

create policy movimiento_lectura on movimiento
  for select to authenticated using (tiene_permiso('movimiento.ver'));
create policy movimiento_insercion on movimiento
  for insert to authenticated with check (tiene_permiso('movimiento.crear'));
-- Sin politicas de UPDATE/DELETE: el kardex es append-only (ademas de los triggers
-- que lo impiden a nivel de base de datos).
