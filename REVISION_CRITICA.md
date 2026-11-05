# Revisión crítica — hallazgos y correcciones

Revisión adversarial del trabajo reciente: **descuento por artículo (VEN-07, commit `585d855`)** y **reporte de compras (REP-07: `0030`, `0031`, `app/(app)/reportes/compras`)**, más el código que esos cambios tocan.

Cada hallazgo se convirtió primero en un test en rojo y después se corrigió. **Los tests quedan** como guardias: cada uno describe un fallo que ocurrió de verdad y que no debe volver.

Estado: **todo en verde, sin pendientes**. Las tres decisiones que quedaban abiertas se resolvieron y están al final. `format:check`, `lint`, `typecheck` y `build` limpios. Los tests de integración se ejecutaron contra el proyecto Supabase real y su limpieza no dejó residuos.

## Dónde vive cada guardia

| Archivo                                          | Cubre                         | Corre                 |
| ------------------------------------------------ | ----------------------------- | --------------------- |
| `lib/ventas/descuento.regresion.test.ts`         | D-01 … D-08                   | siempre               |
| `lib/ventas/acciones-notas.regresion.test.ts`    | A-01 … A-06 (Supabase falso)  | siempre               |
| `lib/ventas/conversion.regresion.test.ts`        | C-02, C-03                    | siempre               |
| `lib/errores.regresion.test.ts`                  | E-01, E-02                    | siempre               |
| `lib/fechas.test.ts`                             | R-03, F-01 y F-02 en el borde | siempre               |
| `lib/paginacion.regresion.test.ts`               | P-01, P-02                    | siempre               |
| `lib/bitacora/rango-fechas.regresion.test.ts`    | F-01, F-02                    | siempre               |
| `lib/inventario/regresiones.integracion.test.ts` | G-01 … G-11                   | solo con `.env.local` |
| `lib/seguridad/migraciones.regresion.test.ts`    | M-03 … M-05 (lee el SQL)      | siempre               |
| `lib/seguridad/rls-api.integracion.test.ts`      | G-12 … G-17                   | solo con `.env.local` |
| `lib/destino.regresion.test.ts`                  | L-01                          | siempre               |
| `lib/validacion.regresion.test.ts`               | W-01 … W-03                   | siempre               |

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

---

## Añadido después: A-06 (19-10-2026)

No sale de esta revisión sino del uso real. Al registrar un artículo nuevo y venderlo, el precio no aparecía y la nota se guardaba con `precio_caja` nulo **sin un solo aviso**: el artículo no estaba en ninguna lista, que es un estado perfectamente normal, pero la pantalla callaba y parecía una avería.

`motivoSinPrecio` devolvía `null` para dos cosas distintas —«el precio se resolvió» y «no hay lista que consultar»—, así que el segundo caso pasaba por bueno. Ahora `precioDeLista` devuelve el motivo (`sin_lista`, `articulo_sin_precio`) y cada uno se explica con lo que hay que hacer. Las guardias están en `lib/ventas/acciones-notas.regresion.test.ts`.

En el mismo cambio: la lista dejó de asignarse cliente por cliente —con una sola activa es la de todos— y las listas se pueden desactivar desde la pantalla, que es lo que impedía arreglar el caso de dos listas activas, el que apaga la publicación automática de precios.

---

## Segunda revisión: la base y los controladores (05-11-2026)

Una revisión del proyecto entero encontró que la regla «la autorización que cuenta es la RLS» tenía excepciones, y otra de los `acciones.ts` encontró fallos que se repetían de archivo en archivo. Ninguna de las guardias anteriores los veía: los tests de integración hablan como `postgres`, así que la RLS no se evaluaba y los privilegios de rol no contaban. `rls-api.integracion.test.ts` corre cada consulta con `set role authenticated` (o `anon`), que es lo que hace PostgREST.

**Estado:** el código, la migración `0036_cerrar_huecos_rls.sql` y las guardias están escritos. **Falta aplicar `0036` al proyecto** (`npm run db:migrar`), regenerar los tipos (`npm run db:types`; a `database.types.ts` se le agregó a mano `fn_registrar_acceso`, que el generador va a reproducir igual) y correr la suite con `.env.local`.

### Bloqueantes · la base no se defendía

| ID        | Qué pasaba                                                                                                                                                                                                                                                                | Cómo quedó (0036)                                                                                                       | Guardia          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **S-03**  | `v_bitacora`, `v_stock_variante` y `v_resumen_categoria` no tenían `security_invoker`: corrían como su dueño y la RLS no se evaluaba. `/bitacora` solo exige sesión y promete «sin `bitacora.ver`, solo la propia»: cualquier usuario veía la de todos.                   | `security_invoker = true` en las tres.                                                                                  | M-03, G-12       |
| **S-04**  | `fn_anular_movimiento` es `security definer` sin `tiene_permiso`: el único control era el `if` de `acciones.ts`. Cualquier sesión movía stock por la API.                                                                                                                 | Exige `movimiento.anular` y motivo.                                                                                     | M-04, G-13       |
| **S-04b** | La misma función dejaba anular la mitad de un traspaso (cajas contadas dos veces), una anulación, y las líneas de una venta o importación confirmada (el documento seguía en los reportes y el stock contaba otra historia). Dos anulaciones simultáneas pasaban las dos. | Rechaza anulaciones y líneas de documentos; `for update` sobre el original. La pantalla esconde el botón en esos casos. | G-13             |
| **S-05**  | `tr_*_confirmada_inmutable` impedía tocar lo confirmado, pero no confirmar a mano: `PATCH venta set estado='CONFIRMADA'` dejaba la venta cobrada sin SALIDAS, sin folio y sin la exigencia de precio. Igual en importación y toma.                                        | `fn_sello_solo_desde_su_funcion` en las tres tablas.                                                                    | M-05, G-14       |
| **S-06**  | Un INSERT directo en `movimiento` (con `movimiento.crear`) podía firmarse a nombre de otro, ser medio traspaso, la salida de una venta inventada o una anulación que bloqueaba la verdadera.                                                                              | `fn_movimiento_desde_la_api`.                                                                                           | G-17             |
| **S-07**  | `anon` tenía EXECUTE en todas las funciones (lo hereda de PUBLIC) y SELECT en todas las tablas: sin sesión se escribía en la bitácora a nombre de «sistema» y se consumían folios.                                                                                        | Revocado a PUBLIC y a `anon`; `fn_siguiente_correlativo` tampoco es ejecutable por `authenticated`.                     | M-04, G-15, G-16 |

### Controladores · `acciones.ts` y el Route Handler

| ID       | Qué pasaba                                                                                                                                                                                                                                         | Cómo quedó                                                                                                                                            | Guardia    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **L-01** | Redirección abierta: `?destino=https://sitio-falso.cl` se pasaba tal cual a `redirect()` después de un login correcto.                                                                                                                             | `destinoSeguro()` (`lib/destino.ts`): solo rutas de este sitio.                                                                                       | L-01       |
| **L-02** | Un usuario desactivado entraba igual (Auth no sabe de `usuario.activo`), y quien ya tenía sesión caía en un bucle de redirecciones `/login` ⇄ `/`, sin salida.                                                                                     | El login lo comprueba y cierra; `requerirUsuario` manda a `/login?inactiva=1` y el middleware cierra esa sesión si el perfil de verdad está inactivo. | —          |
| **U-01** | `ultimo_acceso` se actualizaba con un UPDATE que la RLS filtraba para todo el que no tuviera `usuario.editar`, y comparando el correo tal como se tecleó.                                                                                          | `fn_registrar_acceso()` (0036).                                                                                                                       | —          |
| **W-01** | Un UPDATE o DELETE que la RLS filtra **no da error** en PostgREST: responde 200 con cero filas. Casi todas las ediciones decían «actualizado» sin guardar nada (maestros, empresa, ventas, listas, roles, usuarios, empaques).                     | `.select('id')` + `sinFilas()` en cada escritura de edición.                                                                                          | A-07, W-01 |
| **W-02** | El `id` de los formularios de alta/edición se leía con `Number(...)`: «1.5» llegaba como `id=eq.1.5`.                                                                                                                                              | `leerId()`.                                                                                                                                           | W-02       |
| **W-03** | D-02 por otras puertas: importación, toma, movimientos, stock mínimo y unidades por caja aceptaban más decimales de los que guarda la columna, y la base redondeaba sin avisar. En `unidades_por_caja` es el factor de conversión.                 | `esquemaCajas`, `esquemaImporte` y `decimalesValidos` (`lib/validacion.ts`).                                                                          | W-03       |
| **A-08** | A-03 se arregló en ventas y no en importación, toma ni tipo de cambio: la fecha pasaba sin comprobar que existiera, y de ella sale el tipo de cambio congelado del documento.                                                                      | `esquemaDia` en los tres.                                                                                                                             | —          |
| **T-01** | La toma es por bodega, pero el formulario ofrecía las zonas de todas y la base las aceptaba: aplicar ajustaba stock de una bodega que nadie contó.                                                                                                 | Trigger `fn_toma_zona_de_su_bodega` (0036), comprobación en la acción y zonas filtradas por bodega en la página.                                      | —          |
| **X-09** | La exportación pedía `limit(10000)`, pero PostgREST corta en `db-max-rows` (1000): de 1.001 a 10.000 líneas el Excel salía con mil. X-04 quedaba a medias.                                                                                         | `traerTodo()` por tramos con orden determinista; si no cuadra con el conteo, no se genera.                                                            | —          |
| **X-10** | La exportación pedía solo `reporte.exportar`: sin `reporte.ver`, `venta.ver` o `reporte_compras.ver` daba un Excel vacío o el error crudo de PostgreSQL.                                                                                           | Pide lo mismo que la página, y el detalle del error va al log.                                                                                        | —          |
| **R-04** | `editarRol` contaba los usuarios del rol por la RLS: sin `usuario.ver` salía 0 y se desactivaba un rol con gente dentro. Renombrar «Consulta» rompía toda alta de usuario (`fn_crear_usuario_desde_auth` lo busca por nombre).                     | Exige `usuario.ver` para desactivar; «Consulta» no se renombra ni se desactiva.                                                                       | —          |
| **R-05** | `alternarPermiso` dejaba quitarle `rol.editar` al rol propio: el último administrador se quedaba fuera.                                                                                                                                            | Rechazado, como ya pasaba con el rol y el estado propios en `actualizarUsuario`.                                                                      | —          |
| **U-02** | Se podía asignar un rol desactivado, y `tiene_permiso()` no mira `rol.activo`. Crear un usuario con `usuario.crear` sin `usuario.editar` lo dejaba como «Consulta» diciendo «creado con rol X». Al revertir un correo, el error de Auth se perdía. | Rol activo obligatorio, cero filas = deshacer la cuenta, error de la reversión comprobado. Contraseña con tope de 72 bytes (bcrypt).                  | —          |
| **E-03** | `guardarEmpresa` no exigía `empresa.editar` y no validaba RUT, teléfono ni largos; son datos que salen impresos en cada nota.                                                                                                                      | Permiso y validación como la de clientes.                                                                                                             | —          |
| **S-08** | `preciosPrevios` (costos de compra) solo exigía sesión, como S-02. Los Server Actions de `lib/` no validaban sus argumentos: un texto en `buscarArticulos` era un 500.                                                                             | Permiso del módulo y validación de tipos.                                                                                                             | —          |

### Sigue abierto, y es a propósito

- **El tope de descuento se rodea bajando el precio** cuando el artículo no tiene precio de lista (BACKEND.md § 4.15). Decidir si el precio de lista es obligatorio es del cliente.
- **`crearProducto` no es atómico**: si el empaque falla, el artículo queda sin variante. Arreglarlo es una función `fn_crear_producto` que haga los dos inserts en una transacción.
- **Desactivar un usuario no revoca su sesión en Supabase Auth.** El login y el layout ya lo cierran, y la RLS le niega todo porque `tiene_permiso()` exige `activo`; banearlo en Auth (`ban_duration`) sería la tercera capa.
- **`tiene_permiso()` ignora `rol.activo`.** Ahora no se asigna un rol inactivo y no se desactiva uno con usuarios, así que no hay forma de llegar ahí desde la pantalla; hacerlo en la función sería lo correcto si se quiere que «desactivar» signifique «sin permisos».
- **`xlsx@0.18.5`** tiene advisories sin parche en npm (contaminación de prototipo, ReDoS al leer). En producción solo escribe; los scripts sí leen planillas del cliente. `zod` pide subir a 4.6.6 o más.
