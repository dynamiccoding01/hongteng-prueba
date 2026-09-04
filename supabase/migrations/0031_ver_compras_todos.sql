-- ---------------------------------------------------------------------------
-- 0031 · El reporte de compras lo ve todo el que ve reportes (REP-07)
--
-- v_compras_detalle es security_invoker: la RLS de importacion decide quien lee
-- sus filas. Los roles Ventas y Consulta tenian `reporte.ver` pero no
-- `importacion.ver`, asi que el reporte nuevo les salia vacio.
--
-- Decision del cliente: los reportes los ve todo el mundo. Se concede el
-- permiso de LECTURA sobre importaciones a los dos roles que faltaban, en vez
-- de meter un `or tiene_permiso('reporte.ver')` dentro de la politica: un
-- permiso concedido se ve —y se revoca— desde Administracion > Roles y
-- permisos, mientras que un `or` escondido en la RLS dejaria la pantalla de
-- roles diciendo que Ventas no ve importaciones cuando si las ve.
--
-- Solo lectura. `importacion.crear` no se toca: quien no compraba, sigue sin
-- comprar. El efecto colateral es deliberado y conocido: ademas del reporte,
-- los dos roles pasan a ver el modulo Compras en modo consulta.
-- ---------------------------------------------------------------------------

insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id
  from rol r
  join permiso p on p.codigo = 'importacion.ver'
 where r.nombre in ('Ventas', 'Consulta')
on conflict do nothing;
