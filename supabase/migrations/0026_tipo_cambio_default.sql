-- ---------------------------------------------------------------------------
-- 0026 · El tipo de cambio, ademas de obligatorio, tiene default
--
-- 0025 dejo `venta.tipo_cambio` e `importacion.tipo_cambio` en `not null` y
-- puso un trigger que los rellena con el valor oficial de la fecha. Correcto,
-- pero incompleto: una columna `not null` y sin default sale en los tipos
-- generados como obligatoria al insertar, asi que el `acciones.ts` estaria
-- forzado a mandar un numero... justo el que ya no le toca elegir.
--
-- El default cierra el circulo: la aplicacion no manda nada, el default pone el
-- vigente de hoy y el trigger lo afina al de la fecha del documento (que puede
-- no ser hoy si se registra con fecha atrasada). Nadie teclea el valor en
-- ningun punto del camino.
-- ---------------------------------------------------------------------------

alter table venta
  alter column tipo_cambio set default fn_tipo_cambio_vigente();

alter table importacion
  alter column tipo_cambio set default fn_tipo_cambio_vigente();
