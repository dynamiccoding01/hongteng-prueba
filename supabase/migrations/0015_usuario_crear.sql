-- ---------------------------------------------------------------------------
-- 0015 · Permiso para dar de alta usuarios (ADM-01)
--
-- Hasta aqui las cuentas se creaban a mano en el panel de Supabase y la
-- aplicacion solo permitia cambiarle el rol a alguien que ya existia. Con el
-- alta desde el sistema, crear una cuenta y editarla dejan de ser lo mismo:
-- dar acceso nuevo a una persona es una accion mas delicada que corregirle el
-- nombre, y conviene poder concederlas por separado.
-- ---------------------------------------------------------------------------

insert into permiso (codigo, modulo, descripcion) values
  ('usuario.crear', 'admin', 'Dar de alta usuarios con acceso al sistema')
on conflict (codigo) do nothing;

-- Solo Administrador. Los roles operativos no dan acceso a nadie.
insert into rol_permiso (rol_id, permiso_id)
select r.id, p.id from rol r join permiso p on p.codigo = 'usuario.crear'
 where r.nombre = 'Administrador'
on conflict do nothing;
