-- ---------------------------------------------------------------------------
-- 0029 · Descuento por articulo en la nota de venta (VEN-07)
--
-- Pedido del cliente en la reunion del 2026-09-03. En el mostrador la
-- negociacion no es sobre la nota entera sino sobre cada articulo: el subtotal
-- de una linea da 5.950 y el cliente pide "dejemelo en 5.900". Hoy eso no se
-- puede anotar, y termina arreglandose bajando el precio por caja a mano --lo
-- que ademas no se puede, porque el precio lo fija la lista-- o corrigiendo la
-- cifra despues, fuera del sistema.
--
-- Se guarda el DESCUENTO, no el subtotal final, aunque en pantalla se escriba
-- el subtotal. Son la misma informacion, pero al revés:
--
--   · `precio_caja` sigue siendo el precio de lista, sin tocar. Es lo que hace
--     comparable una venta con otra y lo que lee `precios-previos.ts` para
--     avisar a que precio se vendio la ultima vez. Si el descuento se aplicara
--     bajando el precio, la lista y lo cobrado se confundirian en una sola
--     cifra y no habria como saber cuanto se rebajo.
--   · El descuento queda explicito y sumable: "cuanto se rebajo este mes" es
--     una consulta, no una reconstruccion.
--
-- El subtotal se agrega como columna generada para que la resta tenga una sola
-- definicion. Calcularla en cada pagina y en cada vista es como se llega a que
-- dos pantallas muestren totales distintos para la misma venta.
-- ---------------------------------------------------------------------------

alter table venta_detalle
  add column descuento numeric(14, 4) not null default 0;

comment on column venta_detalle.descuento is
  'VEN-07: rebaja acordada sobre esta linea, en la moneda de la venta. 0 = sin descuento.';

-- ---------------------------------------------------------------------------
-- Que puede y que no puede ser un descuento
--
--   · No puede ser negativo: eso seria un recargo, y subir un precio no es
--     esto. Para cobrar mas se cambia el precio por caja.
--   · No puede pasarse del importe de la linea: un subtotal negativo seria
--     una nota de venta que le devuelve plata al cliente sin que nadie lo
--     haya decidido.
--   · Sin precio no hay nada que rebajar: una linea a la que todavia no se le
--     puso precio lleva descuento 0.
-- ---------------------------------------------------------------------------
alter table venta_detalle
  add constraint venta_detalle_descuento_ck check (
    descuento >= 0
    and (
      (precio_caja is null and descuento = 0)
      or (precio_caja is not null and descuento <= cajas * precio_caja)
    )
  );

-- ---------------------------------------------------------------------------
-- El subtotal, calculado en un solo lugar
--
-- Nulo cuando la linea no tiene precio: es "todavia no se sabe", que no es lo
-- mismo que cero. La distincion ya existia en `precio_caja` y las paginas la
-- muestran como "—".
-- ---------------------------------------------------------------------------
alter table venta_detalle
  add column subtotal numeric(14, 4)
  generated always as (
    case when precio_caja is null then null else cajas * precio_caja - descuento end
  ) stored;

comment on column venta_detalle.subtotal is
  'VEN-07: lo que se cobra por esta linea = cajas x precio_caja - descuento. Generada: no se escribe.';

-- ---------------------------------------------------------------------------
-- Los reportes cobran lo cobrado, no lo listado
--
-- `monto_clp` pasa a salir de `subtotal`. Sin esto el reporte de ventas y la
-- exportacion a Excel seguirian sumando el precio de lista, y la diferencia
-- --justo la que el vendedor rebajo-- no aparecería en ningun lado.
--
-- Se conserva la regla de 0025: la moneda se pregunta, nunca se deduce de un
-- nulo. El tipo de cambio esta siempre (`not null` desde 0026).
-- ---------------------------------------------------------------------------
drop view if exists v_ventas_detalle;
create view v_ventas_detalle
  with (security_invoker = true)
as
select
  vd.id           as detalle_id,
  ve.id           as venta_id,
  ve.fecha,
  cl.id           as cliente_id,
  cl.codigo       as cliente_codigo,
  cl.nombre       as cliente,
  p.codigo        as producto,
  var.unidades_por_caja,
  vd.cajas,
  vd.precio_caja,
  vd.descuento,
  vd.subtotal,
  mo.codigo       as moneda,
  ve.tipo_cambio,
  case
    when mo.codigo = 'CLP' then round(vd.descuento, 0)
    else round(vd.descuento * ve.tipo_cambio, 0)
  end             as descuento_clp,
  case
    when vd.subtotal is null then null
    when mo.codigo = 'CLP'   then round(vd.subtotal, 0)
    else round(vd.subtotal * ve.tipo_cambio, 0)
  end             as monto_clp
from venta_detalle vd
join venta ve  on ve.id = vd.venta_id and ve.estado = 'CONFIRMADA'
join cliente cl on cl.id = ve.cliente_id
join producto_variante var on var.id = vd.variante_id
join producto p on p.id = var.producto_id
join moneda mo on mo.id = ve.moneda_id;

comment on view v_ventas_detalle is
  'REP-05: lineas de ventas confirmadas con cliente, producto, descuento y monto cobrado en CLP.';
