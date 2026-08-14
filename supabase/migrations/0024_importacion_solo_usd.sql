-- ---------------------------------------------------------------------------
-- 0024 · Las importaciones se registran siempre en USD (COM-01)
--
-- Decision del negocio: se compra en dolares, y el dolar pasa a ser la moneda
-- de referencia de todo el costeo y de los precios de venta. El peso queda
-- como forma de facturar, con la conversion hecha al vender.
--
-- Esto elimina de raiz el descuadre que se podia dar antes: costo en una
-- moneda, precio de lista en otra y precio de venta en una tercera, sin que
-- nada obligara a que coincidieran. Con una sola moneda de compra, el costo,
-- el precio de venta de la importacion y la lista de precios hablan todos en
-- dolares y compararlos es exacto.
--
-- No se toca el historico: las importaciones ya confirmadas conservan la
-- moneda con la que se registraron, y son inmutables de todos modos.
-- ---------------------------------------------------------------------------

-- 1. Los borradores en otra moneda pasan a USD. Solo los que no tienen
--    detalle: en uno con lineas, cambiar la moneda reinterpretaria sus costos
--    —50 EUR pasarian a leerse como 50 USD— y eso es una decision de negocio,
--    no algo que deba hacer una migracion en silencio.
do $$
declare
  v_con_detalle int;
begin
  select count(*) into v_con_detalle
    from importacion i
   where i.estado = 'BORRADOR'
     and i.moneda_id <> (select id from moneda where codigo = 'USD')
     and exists (select 1 from importacion_detalle d where d.importacion_id = i.id);

  if v_con_detalle > 0 then
    raise exception
      'Hay % importacion(es) en borrador en otra moneda y con detalle cargado. '
      'Revisalas a mano antes de aplicar esta migracion: cambiarles la moneda '
      'reinterpretaria sus costos.', v_con_detalle;
  end if;

  update importacion
     set moneda_id = (select id from moneda where codigo = 'USD')
   where estado = 'BORRADOR'
     and moneda_id <> (select id from moneda where codigo = 'USD');
end $$;

-- 2. De aqui en adelante, solo USD.
create or replace function fn_importacion_solo_usd()
returns trigger
language plpgsql
as $$
declare
  v_codigo text;
begin
  select codigo into v_codigo from moneda where id = new.moneda_id;

  if v_codigo is distinct from 'USD' then
    raise exception
      'Las importaciones se registran en USD: % no esta permitida',
      coalesce(v_codigo, 'esa moneda');
  end if;

  return new;
end;
$$;

comment on function fn_importacion_solo_usd is
  'COM-01: la compra siempre es en dolares, para que costo y precio de venta compartan moneda.';

create trigger tr_importacion_solo_usd
  before insert or update on importacion
  for each row execute function fn_importacion_solo_usd();
