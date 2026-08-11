-- ---------------------------------------------------------------------------
-- 0016 · Color de identificacion por bodega (MAE-04)
--
-- La operacion tiene pocas bodegas (Iquique, Arica) y muchas zonas dentro de
-- cada una. En pantalla, 'a que bodega pertenece esta zona' se leia como texto
-- en una columna mas. Con un color por bodega se reconoce de un vistazo, sin
-- leer.
--
-- La paleta es CERRADA a proposito: un selector de color libre produce
-- combinaciones ilegibles y, sobre todo, colores que desaparecen en el tema
-- oscuro. Cada valor de esta lista tiene su par claro/oscuro definido en
-- lib/colores-bodega.ts.
-- ---------------------------------------------------------------------------

alter table bodega
  add column color text not null default 'gris';

alter table bodega
  add constraint bodega_color_ck
  check (color in ('azul', 'verde', 'ambar', 'rojo', 'violeta', 'cian', 'rosa', 'gris'));

comment on column bodega.color is
  'Color con el que se identifica la bodega en la interfaz. Paleta cerrada: ver bodega_color_ck.';

-- Las bodegas que ya existen nacerian todas grises. Se les reparte un color
-- distinto siguiendo el orden de su codigo, para que se distingan sin que
-- nadie tenga que entrar a editarlas una por una.
with numeradas as (
  select id, row_number() over (order by codigo) as n
    from bodega
)
update bodega b
   set color = (array['azul', 'verde', 'ambar', 'rojo', 'violeta', 'cian', 'rosa'])[
                 ((numeradas.n - 1) % 7) + 1
               ]
  from numeradas
 where numeradas.id = b.id;

-- Sin cambios de RLS ni de bitacora: la columna vive dentro de `bodega`, que ya
-- tiene su politica (0005_rls.sql) y su trigger tr_bitacora_bodega (0003).
