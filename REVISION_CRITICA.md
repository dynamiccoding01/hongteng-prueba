# Revisión crítica — hallazgos y correcciones

Revisión adversarial del trabajo reciente: **descuento por artículo (VEN-07, commit `585d855`)** y **reporte de compras (REP-07: `0030`, `0031`, `app/(app)/reportes/compras`)**, más el código que esos cambios tocan.

Cada hallazgo se convirtió primero en un test en rojo y después se corrigió. **Los tests quedan** como guardias: cada uno describe un fallo que ocurrió de verdad y que no debe volver.

Estado: **todo en verde, sin pendientes**. Las tres decisiones que quedaban abiertas se resolvieron y están al final. `format:check`, `lint`, `typecheck` y `build` limpios. Los tests de integración se ejecutaron contra el proyecto Supabase real y su limpieza no dejó residuos.

## Dónde vive cada guardia

| Archivo                                          | Cubre                         | Corre                 |
| ------------------------------------------------ | ----------------------------- | --------------------- |
| `lib/ventas/descuento.regresion.test.ts`         | D-01 … D-08                   | siempre               |
| `lib/ventas/acciones-notas.regresion.test.ts`    | A-01 … A-05 (Supabase falso)  | siempre               |
| `lib/ventas/conversion.regresion.test.ts`        | C-02, C-03                    | siempre               |
| `lib/errores.regresion.test.ts`                  | E-01, E-02                    | siempre               |
| `lib/fechas.test.ts`                             | R-03, F-01 y F-02 en el borde | siempre               |
| `lib/paginacion.regresion.test.ts`               | P-01, P-02                    | siempre               |
| `lib/bitacora/rango-fechas.regresion.test.ts`    | F-01, F-02                    | siempre               |
| `lib/inventario/regresiones.integracion.test.ts` | G-01 … G-11                   | solo con `.env.local` |

Migraciones nuevas: `0032_confirmar_con_importe.sql`, `0033_resumen_reportes.sql`, `0034_reporte_compras_permiso.sql` y `0035_tope_descuento_rol.sql`, todas aplicadas al proyecto (`npm run db:migrar`) y con los tipos regenerados (`npm run db:types`).

---

## Bloqueantes · corregidos

### D-01 / G-03 · El descuento no cabía en el CHECK de la base

`lib/ventas/descuento.ts` redondeaba el bruto a cuatro decimales en coma flotante; PostgreSQL multiplica `cajas numeric(14,2) × precio_caja numeric(14,4)` exacto, con hasta **seis**. Cuando el redondeo subía, el descuento superaba el importe real:

```
cajas 0,05 · precio 20,0010 · subtotal pedido 0
  importe exacto de la base : 1,000050
  descuento que mandaba     : 1,0001
  subtotal generado         : -0,0001   ← negativo
  → ERROR 23514: venta_detalle_descuento_ck
```

Verificado contra la base real. Quien digitaba veía el error de constraint en crudo y no podía guardar la línea.

**Corregido:** toda la aritmética pasó a enteros (`bigint`, en millonésimas: las dos décimas de la cantidad más las cuatro del precio) y la rebaja final se **trunca hacia abajo** a los cuatro decimales de la columna. Truncar a la baja cobra como mucho una diezmilésima de más; redondear al cercano puede cobrar de menos, y eso es un descuento que nadie decidió.

### A-01 · Corregir una línea borraba el descuento acordado

`editarLineaVenta` leía «no vino `subtotal`» como «descuento 0» y escribía siempre. Se llegaba por dos caminos, y el segundo solo: `CampoSubtotal` volvía al bruto cada vez que el bruto cambiaba, y el bruto cambia **por su cuenta** cuando llega la respuesta asíncrona de `precioDeLista`. La rebaja pactada desaparecía sin que nadie tocara nada.

**Corregido en los dos lados:**

- Servidor: la acción lee el `descuento` guardado y, si el formulario no trae subtotal, llama a `descuentoVigente` — «la rebaja acordada sigue en pie». Si esa rebaja ya no cabe en la línea (bajó la cantidad o el precio), avisa en vez de recortarla por lo bajo.
- Cliente: lo que viaja al cambiar la cantidad o el precio es **la rebaja**, no el subtotal. De 7 cajas a 10, los 50 acordados siguen siendo 50 —arrastrar los 5.900 habría regalado 2.600—. Y el campo usa las mismas funciones que el servidor, así que lo que se ve mientras se teclea es lo que se guarda.

### A-02 · Corregir una línea borraba el precio guardado

`precio = lista?.precioVenta ?? precio_caja ?? null`: sin lista y con el campo vacío, el `update` pisaba con `null` un precio que estaba puesto. **Corregido:** el precio guardado cierra la cadena de alternativas.

### G-01 / G-02 · Se podía confirmar un documento sin importe

`fn_confirmar_venta` no exigía precio y `fn_confirmar_importacion` no exigía costo. Verificado: la venta se confirmaba, generaba sus `SALIDA` y la mercadería salía de bodega; su `subtotal` quedaba nulo y todas las pantallas de reportes lo sumaban como cero. Mercadería despachada que no figuraba en ninguna cifra de venta.

**Corregido** en `0032`, en la base y no en la página: confirmar es lo que sella el documento y mueve stock, así que la regla tiene que vivir donde no se la pueda rodear. No toca lo ya confirmado; los documentos históricos incompletos se cuentan aparte (más abajo).

### R-01 · Los totales de los reportes se cortaban en silencio

Las dos páginas de reportes se traían el período entero para sumarlo en TypeScript, sin `range`, sin `limit` y sin `count`. PostgREST corta esa consulta en `db-max-rows` (1000 por defecto) **sin decirlo**: pasadas mil líneas, el «$ X CLP» del encabezado y las dos tablas de resumen eran números cortos con toda la pinta de estar bien.

**Corregido** en `0033`: `fn_ventas_resumen` y `fn_compras_resumen` agregan en la base y devuelven pocas filas —una por cliente o proveedor, una por producto, y una fila `TOTAL` que va **primera**, para que siga estando aunque alguna vez el resto se corte—. Son `language sql stable` sin `security definer`, así que la RLS de las tablas de abajo sigue decidiendo qué se agrega. El test `G-07` comprueba que el resumen cuadra con el detalle y que cada agrupación suma el mismo total.

### R-02 · El error del resumen se descartaba

`const [{ ... error }, { data: paraResumen }]`: la segunda consulta se destructuraba sin `error`, y un fallo dejaba la pantalla diciendo «$ 0 CLP», que se lee como «no hubo ventas». **Corregido:** se comprueban los dos errores, el detalle queda en el log del servidor y al usuario se le dice que no se pudo cargar —sin pintarle el mensaje de PostgREST, que es lo que hacía antes (X-07)—.

---

## Importantes · corregidos

| ID       | Qué pasaba                                                                                                                                                                                 | Cómo quedó                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-02** | `cajas` es `numeric(14,2)` y el campo era `step="any"`: 1,005 se guardaba como 1,01 y el subtotal cobrado dejaba de ser el acordado.                                                       | La cuenta rechaza más de dos decimales con un mensaje que lo explica, y `CampoCantidad` pasa a `step={0.01}` para evitarlo antes de enviar.                     |
| **D-03** | `NaN`, `Infinity` y cantidades negativas se colaban como «sin descuento», o daban «el subtotal no puede superar los −5950».                                                                | Cada uno da un error propio, también en el componente de cliente, donde no hay Zod.                                                                             |
| **A-03** | `fecha` era `z.string().trim().optional()`: «mañana» llegaba a PostgreSQL y volvía en inglés; «2019-01-01» congelaba el tipo de cambio de 2019 en una venta de hoy.                        | `esquemaDia` en el borde, y `notas` con largo máximo.                                                                                                           |
| **R-03** | `desde` y `hasta` de los reportes iban crudos a `.gte()/.lte()`.                                                                                                                           | `diaOmitido` en las páginas y un 400 explícito en la exportación.                                                                                               |
| **F-01** | `?desde=9999-99-99` pasaba la expresión regular de la bitácora, daba `Invalid Date` y hacía saltar un `RangeError` dentro de `Intl`: un **500** en la pantalla de auditoría.               | `lib/fechas.ts` comprueba que el día **exista**, no solo su forma. La página lo usa en su Zod y `rango-fechas` se defiende además por su cuenta.                |
| **F-02** | `2026-02-30` se interpretaba como el 2 de marzo y el filtro se aplicaba a un rango que nadie pidió.                                                                                        | Mismo arreglo: se rechaza en vez de corregirlo por dentro.                                                                                                      |
| **E-01** | `23502`, `22003` y `22P02` salían en inglés y crudos. El primero es **la primera venta de una instalación** sin tipo de cambio cargado.                                                    | Traducidos, con la columna que falta cuando se puede.                                                                                                           |
| **E-02** | Todos los CHECK daban «alguno de los valores está fuera del rango permitido». Con `venta_detalle_descuento_ck` era lo que se leía justo después de escribir un subtotal.                   | Se lee el nombre del constraint del mensaje de PostgreSQL y hay una frase por regla; las que no estén en el mapa al menos dicen cuál es.                        |
| **S-02** | `precioDeLista` es un Server Action y solo exigía `requerirUsuario()`.                                                                                                                     | Exige `venta.ver`. La RLS sigue siendo la barrera; esto cierra la puerta a quien ni siquiera entra al módulo.                                                   |
| **C-02** | `convertirAPesos` devolvía 0 con tipo de cambio 0 y `NaN` con `NaN`. Hoy la base lo impide, pero el precio se cobraría.                                                                    | Devuelve `null`, y hay un motivo nuevo —`tipo_cambio_invalido`— con su mensaje en el formulario y en la acción.                                                 |
| **P-01** | `?pagina=1e15` mandaba un `OFFSET` de quince mil billones en **todas** las pantallas.                                                                                                      | El tope se pone sobre el desplazamiento (un millón de filas), que es lo que le cuesta a la base.                                                                |
| **H-01** | La limpieza de los tests hacía `alter table ... disable trigger` contra el proyecto **real**: un Ctrl-C entre el `disable` y el `enable` dejaba la base sin sus protecciones, en silencio. | `set session_replication_role = replica`, que solo vale para esa sesión y muere con la petición. Cambiado en los siete archivos de integración.                 |
| **H-02** | El 429 de la Management API tumbaba seis archivos de integración a la vez, con un rojo que no era del código.                                                                              | `scripts/api-supabase.ts` espacia las consultas (~1,1 s) y reintenta el 429 con espera creciente; `hookTimeout` global para que el montaje no muera a la mitad. |
| **X-01** | El vacío del reporte se decidía con la página que se estaba mirando: en la página 3 de 2 decía «no hay importaciones en el período» junto a un total que no era cero.                      | Se decide con el total del período.                                                                                                                             |
| **X-02** | El `form` GET del filtro reescribe la query entera y se llevaba por delante la elección de 10/15/20 filas.                                                                                 | Viaja como campo oculto.                                                                                                                                        |
| **X-03** | La bitácora registraba «Reporte compras-por-periodo (N filas)» **sin el período**.                                                                                                         | El período va en la descripción.                                                                                                                                |
| **X-04** | `.limit(10000)` recortaba el Excel sin decirlo, y `estadistica`/`valorizacion` ni siquiera tenían tope: los cortaba PostgREST.                                                             | Se cuenta primero y, si no cabe, se explica y no se genera nada. Un Excel corto que parece entero circula por correo.                                           |
| **X-06** | El test de borradores borraba sus datos al final del `it`: si la aserción fallaba, el borrador se quedaba en la base del cliente.                                                          | `try` / `finally`.                                                                                                                                              |
| **X-08** | _Encontrado al corregir_: ninguna de las dos páginas de reportes mostraba el detalle, pero las dos hacían la consulta paginada y pintaban un `Paginacion` sobre nada.                      | Se muestra el detalle que ya se estaba consultando. Los resúmenes y el filtro, que eran copia y copia, viven ahora en `app/(app)/reportes/resumen.tsx`.         |
| **M-01** | `0030` creaba la vista sin `drop view if exists`, al revés que `0029`.                                                                                                                     | Corregido; la migración se puede reaplicar.                                                                                                                     |
| **M-02** | Si los roles se llamaran distinto, el `insert ... select` de `0031` no insertaría nada y no avisaría.                                                                                      | Cubierto por el test `G-06`.                                                                                                                                    |

### Documentos históricos sin importe

`0032` impide crear nuevos, pero los que ya estaban confirmados sin precio o sin costo siguen ahí y sus líneas no se pueden valorizar. Las funciones de resumen los cuentan aparte (`sin_importe`) y las dos páginas lo dicen con un aviso, en vez de sumarlos como cero.

---

## Decisiones tomadas

Las tres preguntas que quedaban abiertas se resolvieron y están implementadas.

### S-01 · El reporte de compras deja de abrir el módulo Compras → migración 0034

**Decisión: solo el reporte, no el módulo.** `0031` había concedido `importacion.ver` a Ventas y Consulta para que el reporte no les saliera vacío, y de paso les abría Compras entero —borradores, documentos de aduana, el detalle de cada importación—.

Ahora son dos permisos distintos: `reporte_compras.ver` da los totales del período; `importacion.ver` da el módulo. El costo sigue a la vista de quien tenga el reporte —es de lo que trata REP-07— pero ver el reporte ya no arrastra lo demás. Como la vista es `security_invoker`, el reporte se lee por dos funciones `security definer` que comprueban el permiso antes de devolver nada.

De paso: el reporte de **ventas** hacía lo mismo en silencio. Consulta tiene `reporte.ver` pero no `venta.ver`, así que la RLS le devolvía una tabla vacía que se leía como «no hubo ventas». Ahora lo dice. No se le concedió `venta.ver` a nadie: quién ve las ventas es otra decisión y no estaba sobre la mesa.

**Guardias:** `G-06` (los permisos quedaron separados) y `G-09` (las funciones se niegan a quien no tiene el permiso).

### D-08 · Tope de descuento por rol → migración 0035

**Decisión: un porcentaje máximo por rol**, editable en Administración › Roles y permisos. `null` = sin tope, que es como arrancan todos: la migración no cambia el comportamiento de nadie hasta que se configure.

Por rol y no global porque el punto es distinguir: un vendedor cierra hasta cierto margen y de ahí para arriba lo autoriza quien puede. Un tope único topa también a quien debería poder pasarse, y entonces se «arregla» subiéndolo un rato, que es como se pierde el control de verdad.

Lo hace cumplir un trigger sobre `venta_detalle`; la acción lo comprueba antes para dar la frase entera en vez de la excepción de PostgreSQL, y el campo Subtotal escribe el mínimo que se puede cobrar —«puede bajarlo hasta 5.355»— en vez del porcentaje: es lo que hay que poder decir en el mostrador sin hacer la cuenta de cabeza.

**Guardias:** `D-08a` … `D-08f` (la cuenta, incluido que el tope se recorta a la baja), `A-05` (la acción no deja pasar la escritura) y `G-10` / `G-11` (el trigger, con y sin tope).

### Precios previos · las dos cifras, con su procedencia

**Decisión: se propone el de la lista y al lado se ve lo que se cobró de verdad.** La lista es la decisión vigente y sigue siendo la propuesta; debajo aparece «Última venta: 34 USD el 12-08 a Comercial X».

Lo cobrado sale de `venta_detalle.subtotal` —la columna generada, ya con el descuento restado— repartido entre las cajas de la línea, y solo de ventas confirmadas **en dólares**: es el mismo criterio que ya usaba el costo, porque en pesos la cifra no es comparable sin arrastrar una conversión del día.

Es el mismo trato que se le da al costo: se propone, con su origen a la vista, y decide quien compra.

---

## Sigue abierto, y es a propósito

### X-05 · Redondeo por línea

`monto_clp` se redondea línea a línea en las vistas, así que la suma del período no coincide exactamente con `round(suma)`. Resumen y detalle sí cuadran entre sí —los dos usan las mismas cifras redondeadas—, que es lo que se puede reconciliar a mano. Cambiarlo sería cambiar cómo se valoriza, no arreglar un fallo.
