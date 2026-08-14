-- ---------------------------------------------------------------------------
-- 0022 · Corrige la unidad de medida de los productos cargados (MAE-01/MAE-07)
--
-- Los nueve articulos del catalogo quedaron con unidad de medida "Caja". Eso
-- hace que el sistema se lea solo: "cada caja trae 5 cajas", porque la caja ya
-- es el empaque (producto_variante.unidades_por_caja) y la unidad de medida
-- debe decir QUE hay dentro, no como viene envuelto.
--
-- No cambia ningun calculo: el factor de conversion cajas <-> unidades es
-- unidades_por_caja de la variante, y esta columna solo rotula. Por eso se
-- puede corregir con datos ya en kardex sin reinterpretar existencias.
--
-- Criterio: todo calzado se cuenta en PAR (bototo, pantufla, zapatillas). Una
-- polera es una PIEZA, y lo mismo el articulo de la categoria CELULARES.
--
-- Idempotente: solo toca las filas que siguen en 'CAJ', asi que volver a
-- aplicarla no pisa una correccion manual posterior. En una base recien creada
-- no encuentra ninguno de estos codigos y no hace nada.
-- ---------------------------------------------------------------------------

update producto
   set unidad_medida_id = (select id from unidad_medida where codigo = 'PAR')
 where codigo in ('BT-4501', 'PT-3301', 'ZD-8801', 'ZH-8802', 'ZJ-2201', 'ZN-6101', 'ZN-6103')
   and unidad_medida_id = (select id from unidad_medida where codigo = 'CAJ');

update producto
   set unidad_medida_id = (select id from unidad_medida where codigo = 'PIEZA')
 where codigo in ('PL-7702', 'JC-CORO')
   and unidad_medida_id = (select id from unidad_medida where codigo = 'CAJ');

-- Nota deliberada: la unidad 'CAJ' se deja activa en el maestro. Retirarla
-- evitaria que el error se repita, pero es una decision del cliente sobre su
-- maestro y no algo que corresponda decidir en una correccion de datos.
