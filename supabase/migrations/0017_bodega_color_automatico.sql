-- ---------------------------------------------------------------------------
-- 0017 · El color de la bodega se asigna solo y no se edita (MAE-04)
--
-- En 0016 el color era un campo mas del formulario. Elegirlo a mano no aporta
-- nada: lo unico que importa es que dos bodegas no compartan color, y de eso
-- se encarga mejor la base que una persona.
--
-- Queda en un trigger y no en la accion de Next: es la regla de negocio, y dos
-- altas simultaneas desde dos pantallas tienen que ver el mismo estado. En
-- TypeScript habria que leer los colores usados y despues escribir, con una
-- carrera en el medio.
-- ---------------------------------------------------------------------------

-- Sin default: el trigger es quien rellena la columna. El `not null` se sigue
-- cumpliendo porque los BEFORE se ejecutan antes de comprobarlo.
alter table bodega alter column color drop default;

create or replace function fn_asignar_color_bodega()
returns trigger
language plpgsql
as $$
declare
  -- 'gris' queda fuera a proposito: es el color de respaldo de la interfaz
  -- cuando llega un valor inesperado, no un color de bodega.
  paleta  text[] := array['azul', 'verde', 'ambar', 'rojo', 'violeta', 'cian', 'rosa'];
  elegido text;
begin
  -- Un color explicito se respeta (migraciones, correcciones puntuales).
  if new.color is not null then
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

comment on function fn_asignar_color_bodega() is
  'MAE-04: da a cada bodega nueva el primer color libre de la paleta.';

create trigger tr_bodega_color_asignar
  before insert on bodega
  for each row execute function fn_asignar_color_bodega();

-- ---------------------------------------------------------------------------
-- El color no se edita.
--
-- Se conserva el anterior en silencio en vez de lanzar un error: asi un
-- `update` que reescribe la fila entera sigue funcionando. La interfaz
-- directamente no manda el campo.
-- ---------------------------------------------------------------------------
create or replace function fn_color_bodega_inmutable()
returns trigger
language plpgsql
as $$
begin
  new.color := old.color;
  return new;
end;
$$;

comment on function fn_color_bodega_inmutable() is
  'MAE-04: el color de una bodega es de la base, no del formulario.';

create trigger tr_bodega_color_inmutable
  before update on bodega
  for each row execute function fn_color_bodega_inmutable();
