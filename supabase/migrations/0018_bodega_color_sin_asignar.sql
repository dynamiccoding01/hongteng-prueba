-- ---------------------------------------------------------------------------
-- 0018 · 'gris' vuelve a ser el default de bodega.color (MAE-04)
--
-- 0017 quito el default para que el trigger rellenara la columna. El efecto
-- secundario aparecio al regenerar los tipos: sin default, `color` pasa a ser
-- obligatorio en el Insert generado, y la aplicacion tendria que mandar
-- justamente el dato que ya no elige nadie.
--
-- Se recupera el default y 'gris' pasa a significar 'sin asignar': el trigger
-- lo reemplaza por el primer color libre. Un color explicito distinto de gris
-- se sigue respetando, que es lo que necesitan las migraciones y las
-- correcciones puntuales por SQL.
-- ---------------------------------------------------------------------------

alter table bodega alter column color set default 'gris';

create or replace function fn_asignar_color_bodega()
returns trigger
language plpgsql
as $$
declare
  -- 'gris' queda fuera de la paleta a proposito: es el color de respaldo de la
  -- interfaz y, aqui, la marca de 'todavia sin asignar'.
  paleta  text[] := array['azul', 'verde', 'ambar', 'rojo', 'violeta', 'cian', 'rosa'];
  elegido text;
begin
  if new.color is not null and new.color <> 'gris' then
    return new;
  end if;

  -- El primer color de la paleta que no este ocupado por otra bodega.
  select p.color into elegido
    from unnest(paleta) with ordinality as p(color, orden)
   where not exists (select 1 from bodega b where b.color = p.color)
   order by p.orden
   limit 1;

  -- Con mas bodegas que colores se vuelve a empezar. Dos bodegas del mismo
  -- color es peor que ninguna, pero es preferible a dejar el alta sin color.
  if elegido is null then
    select paleta[(count(*) % array_length(paleta, 1)) + 1] into elegido from bodega;
  end if;

  new.color := elegido;
  return new;
end;
$$;
