-- ---------------------------------------------------------------------------
-- 0030 · Compras por periodo (REP-07)
--
-- El modulo de Reportes solo miraba la salida: cuanto se vendio, a quien y de
-- que. El cliente pidio la contraparte —cuanto se compro, a que proveedor y de
-- que articulo— con el mismo corte por fechas.
--
-- Es la simetrica de v_ventas_detalle y se construye igual: una linea por
-- detalle de importacion CONFIRMADA, con el proveedor y el producto resueltos y
-- el importe convertido a CLP.
--
-- Solo confirmadas: un borrador es una intencion, y sumarlo diria que se
-- compro mercaderia que todavia no entro a bodega.
--
-- La conversion pregunta por la moneda en vez de deducirla de un nulo. Desde
-- 0024 toda importacion nueva va en USD y desde 0025 tipo_cambio es not null,
-- pero el historico anterior conserva su moneda: un `coalesce(tipo_cambio, 1)`
-- valorizaria una compra en dolares como si el dolar valiera un peso.
--
-- security_invoker: la RLS de importacion / importacion_detalle decide quien ve
-- que. Quien no tenga `importacion.ver` no lee ni una fila, aunque tenga
-- `reporte.ver` — la pagina lo dice explicitamente en vez de mostrar una tabla
-- vacia que parece "no hubo compras".
-- ---------------------------------------------------------------------------

-- `drop` antes del `create`, como en 0029: asi la migracion se puede volver a
-- aplicar sobre una base donde la vista ya exista sin fallar a la mitad.
drop view if exists v_compras_detalle;

create view v_compras_detalle
  with (security_invoker = true)
as
select
  d.id              as detalle_id,
  i.id              as importacion_id,
  i.fecha,
  i.documento_aduana,
  pr.id             as proveedor_id,
  pr.codigo         as proveedor_codigo,
  pr.nombre         as proveedor,
  p.codigo          as producto,
  var.unidades_por_caja,
  d.cajas,
  d.costo_caja,
  -- El precio de venta fijado al comprar (0023) viaja en la misma linea y en
  -- la misma moneda que el costo: se expone para que el reporte pueda mostrar
  -- con que margen entro la mercaderia sin cruzar con la lista de precios.
  d.precio_venta_caja,
  mo.codigo         as moneda,
  i.tipo_cambio,
  case
    when d.costo_caja is null then null
    else d.cajas * d.costo_caja
  end               as subtotal,
  case
    when d.costo_caja is null   then null
    when mo.codigo = 'CLP'      then round(d.cajas * d.costo_caja, 0)
    else round(d.cajas * d.costo_caja * i.tipo_cambio, 0)
  end               as monto_clp
from importacion_detalle d
join importacion i  on i.id = d.importacion_id and i.estado = 'CONFIRMADA'
join proveedor pr   on pr.id = i.proveedor_id
join producto_variante var on var.id = d.variante_id
join producto p     on p.id = var.producto_id
join moneda mo      on mo.id = i.moneda_id;

comment on view v_compras_detalle is
  'REP-07: lineas de importaciones confirmadas con proveedor, producto y monto en CLP.';
