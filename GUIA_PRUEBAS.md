# Guía de pruebas y demostración

Cómo probar el sistema de punta a punta antes de mostrárselo al cliente.
Dos partes: **A) pruebas** (que funciona), **B) demo** (cómo mostrarlo).

Estado al 2026-08-01: la aplicación levanta, el login responde, las 16 tablas
del esquema están creadas y **la base ya tiene datos de demostración cargados**.

---

## A0. Datos de demostración cargados

Los datos de prueba que habían dejado los tests (`TESTIMP-…`, «Cat test», «Cli
test») fueron reemplazados por un catálogo del rubro. No quedan residuos en los
maestros.

### Catálogo (8 artículos, con descripción bilingüe y código de barras EAN-13)

| Código    | Artículo                       | 中文       | Categoría | Tallas | u/caja | Proveedor         |
| --------- | ------------------------------ | ---------- | --------- | ------ | ------ | ----------------- |
| `ZN-6101` | Zapatilla escolar niño, negro  | 童鞋 黑色  | Niño      | 30-35  | 12     | Fujian Xingda     |
| `ZN-6103` | Zapatilla escolar niña, blanco | 童鞋 白色  | Niño      | 28-34  | 5      | Zhejiang Kanglong |
| `ZJ-2201` | Zapatilla juvenil unisex       | 少年运动鞋 | Juvenil   | 34-39  | 10     | Zhejiang Kanglong |
| `ZD-8801` | Zapatilla deportiva dama       | 女式运动鞋 | Adulto    | 35-40  | 5      | Fujian Xingda     |
| `ZH-8802` | Zapatilla urbana hombre        | 男式休闲鞋 | Adulto    | 39-44  | 6      | Guangzhou Meilin  |
| `BT-4501` | Bototo de cuero hombre         | 男式皮靴   | Adulto    | 39-44  | 10     | Guangzhou Meilin  |
| `PT-3301` | Pantufla polar adulto          | 家居棉拖鞋 | Adulto    | 36-42  | 10     | Yiwu Hongyu       |
| `PL-7702` | Polera de algodón unisex       | 纯棉T恤    | Ropa      | S-XL   | 10     | Yiwu Hongyu       |

### Bodegas y zonas

- **IQQ — Iquique · ZOFRI**: zonas `1-1`, `1-2`, `1-3`, `2-4`, `2-5`, `M2-1`, `M3-1`
- **ARI — Arica · Sucursal**: zonas `A-1`, `A-2`

Las zonas usan los códigos del formato real del cliente (estantería-nivel,
mezanina), para que la migración de `BODEGA.xls` se vea como continuación de lo
mismo.

### Existencias, clientes y proveedores

- **2.785 cajas · 22.685 unidades**, repartidas en las 9 zonas.
- Valorización total: **$79.908.337 CLP** al último costo de importación (dólar a 947,30).
- 4 clientes: Comercial Andina Ltda. (Iquique), Distribuidora Norte Grande SpA
  (Antofagasta), Importadora Tarapacá Ltda. (ZOFRI), Multitiendas El Loa SpA
  (Calama). Todos con RUT de dígito verificador válido y asignados a la lista de
  precios **Mayorista USD**.
- 4 proveedores chinos con nombre en 中文, contacto y correo.
- 2 artículos bajo stock mínimo, para que la pantalla de alertas tenga contenido.

El stock entró como corresponde: **movimientos**, nunca escribiendo la tabla
`stock`. Las existencias base son ENTRADA con documento `MIGRACION` (lo mismo
que generará la carga de `BODEGA.xls`) y encima hay una importación real
`DIN-2026-0142` confirmada con `fn_confirmar_importacion`, que es la que da
costo a los artículos.

### Lo único que quedó feo, y por qué no se puede arreglar

Hay **dos importaciones antiguas con documento de aduana `203-TEST`** (4 cajas
cada una). No se pueden editar ni borrar: el trigger
`tr_importacion_confirmada_inmutable` rechaza cualquier `UPDATE` o `DELETE`
sobre una importación confirmada. Es exactamente la regla que le vamos a
presentar al cliente como garantía, así que **no se toca**.

Opciones: dejarlas (aparecen al final del listado, con 4 cajas), o convertirlo
en argumento de venta: «esas dos son de las pruebas del sistema; fíjese que ni
yo, que lo programé, puedo borrarlas».

La **bitácora** tiene además ~2.200 registros de las pruebas. Tampoco se puede
limpiar, por diseño (append-only e inmutable). Para la demo conviene filtrarla
por fecha de hoy.

---

## A1. Levantar el sistema

Con **una sola** cosa corriendo a la vez (nunca `build` y `dev` juntos):

```bash
npm run dev
```

Abrir http://localhost:3001 → debe redirigir solo a `/login`.

Verificación previa opcional, si algo se ve raro:

```bash
npm run db:probar
```

Debe reportar `16/16 tablas creadas`.

### Usuarios disponibles

| Correo                  | Rol           | Para qué                                                |
| ----------------------- | ------------- | ------------------------------------------------------- |
| `ajosuevedia@gmail.com` | Superadmin    | Desarrollo / TI: ve y edita todos los roles             |
| `corojosue91@gmail.com` | Administrador | **El que se usa en la demo**: es lo que verá el cliente |

Para la prueba de permisos (A3) conviene crear un tercer usuario:

1. Panel de Supabase → **Authentication → Users → Add user**, con **Auto Confirm User** marcado.
2. Queda con rol **Consulta** automáticamente (trigger `tr_auth_user_creado`).
3. Para hacerlo Bodeguero:

```bash
npx tsx scripts/asignar-rol.ts bodega.demo@ejemplo.com Bodeguero
```

Ver la lista de usuarios y roles en cualquier momento:

```bash
npx tsx scripts/asignar-rol.ts
```

---

## A2. Recorrido de pruebas

Orden pensado para que cada paso deje preparado el siguiente. Ir marcando.

### 1. Login y navegación — `/login`

- [ ] Entrar con el usuario Administrador.
- [ ] El menú lateral muestra Inventario, Maestros, Compras, Ventas, Reportes, Administración.
- [ ] Cambiar idioma a 中文 (selector abajo en el menú) → el **menú** se traduce; el contenido de las páginas sigue en español (es a propósito).
- [ ] Cambiar el tema claro/oscuro y recargar: la preferencia se mantiene.

### 2. Stock y búsqueda — `/inventario/stock`, `/articulos`

Antes de crear nada, comprobar que lo cargado se ve bien.

- [ ] Stock por zona muestra las 9 combinaciones artículo × zona con sus cajas y unidades.
- [ ] Buscar `ZD` en el buscador → aparece la zapatilla deportiva dama con su ubicación.
- [ ] `ZN-6101` muestra 540 cajas / 6.480 unidades en la zona 1-1 (12 pares por caja: la conversión la hace la base de datos).

### 3. Maestros: crear datos nuevos — `/maestros/zonas`, `/maestros/productos`

- [ ] Crear la zona `2-6` en la bodega IQQ.
- [ ] Escribir una zona en minúscula y con espacios (`m2-2 `) → se guarda como `M2-2`.
- [ ] Intentar crear la zona `1-1` de nuevo → mensaje **«Ya existe un zona con ese código»**, no un error técnico.
- [ ] Crear el artículo `ZD-8803` «Sandalia dama verano», categoría Adulto, tallas 35-40, unidad **PAR**, 8 unidades por caja.
- [ ] En `ZD-8801`, agregar una **segunda variante** con 10 unidades por caja: es el caso real del cliente, mismo código con distinto empaque.

### 4. Importación: la mercadería entra — `/compras/importaciones`

Este es el flujo que carga el stock. **Nunca se escribe stock a mano.**

- [ ] Crear importación: proveedor **Fujian Xingda Shoes Co.**, documento de aduana `DIN-2026-0155`.
- [ ] No hay dónde elegir moneda ni tipo de cambio: el formulario dice que la compra va en **USD** y anuncia con qué dólar se va a grabar. Los dos datos los pone la base.
- [ ] Queda en estado **BORRADOR**.
- [ ] Agregar detalle y elegir `ZN-6103`: los dos precios **se rellenan solos** (19 y 38 USD) y debajo de cada uno dice de dónde salieron — última compra con su fecha e importación, y la lista de precios vigente.
- [ ] Elegir `JC-CORO`, que nunca se ha comprado: los precios quedan **vacíos** y lo dice («Primera compra de este artículo»).
- [ ] Elegir el empaque de **8 por caja** de `BT-4501`: también queda vacío, porque su única compra fue en pesos y ese costo no se puede proponer como dólares.
- [ ] Agregar detalle: `ZD-8803` → zona `2-6`, **80** cajas, compra 31 USD/caja, venta 45 USD/caja.
- [ ] Intentar un precio de venta **menor** al de compra → lo rechaza (`importacion_detalle_margen_ck`).
- [ ] Agregar detalle: `BT-4501` → zona `2-5`, **50** cajas, compra 25 USD/caja, venta 38 USD/caja.
- [ ] **Confirmar** la importación.
- [ ] Stock por zona: `BT-4501` pasó de 250 a **300** cajas, y aparece `ZD-8803` en la 2-6.
- [ ] La importación confirmada ya **no se puede editar** ni volver a confirmar.

### 5. Movimientos y kardex — `/inventario/movimientos`, `/inventario/kardex`

- [ ] En Movimientos aparecen las dos ENTRADAS nuevas con documento IMPORTACION.
- [ ] En Kardex, filtrar por `BT-4501`: se ve la entrada con el **saldo resultante** (300).
- [ ] El saldo del kardex **concilia** con lo que muestra Stock por zona.

### 6. Traspaso entre zonas — `/inventario/traspasos`

- [ ] Traspasar **60 cajas** de `ZD-8801` de la zona `1-2` a `A-1` (Arica).
- [ ] Stock: 1-2 baja a 420, A-1 sube en 60. **El total de la empresa no cambió.**
- [ ] En Movimientos se ven **dos** registros: TRASPASO_SALIDA y TRASPASO_ENTRADA.

### 7. Venta: la mercadería sale — `/ventas/precios`, `/ventas/notas`

La lista **Mayorista USD** ya tiene precio para los 8 artículos y los 4 clientes
la tienen asignada.

- [ ] En Listas de precios, revisar los precios cargados (ej. `ZD-8801` a 45 USD/caja) y cambiar uno.
- [ ] En Notas de venta, crear una nota para **Comercial Andina Ltda.** en **USD** → al agregar `ZD-8801` el precio sale solo de la lista y el campo está **bloqueado**.
- [ ] En el buscador de artículos de esa misma ventana, un artículo **sin existencia** aparece en gris, en rojo dice «no hay nada que sacar de bodega» y **no se deja elegir**.
- [ ] La cantidad arranca en **1** y las flechas cuentan 1, 2, 3 (no 0,01 → 1,01). Debajo se lee la equivalencia: `2 cajas × 5 par = 10 par`.
- [ ] Vender **40 cajas** desde la zona 1-2 y confirmar.
- [ ] Stock: la zona 1-2 baja a 380. En Movimientos hay una SALIDA con documento VENTA.

#### 7.1 La misma venta, pero en pesos

- [ ] Crear otra nota para **Comercial Andina Ltda.**, esta vez en **CLP**. El formulario no pide tipo de cambio: anuncia con cuál se va a grabar.
- [ ] Solo se ofrecen **USD y CLP**: euros, UF y UTM no están en la lista.
- [ ] Agregar `ZN-6103` (38 USD en la lista) → el precio sale **bloqueado en pesos** y debajo se lee la cuenta entera: `38 × 947,3 = 35.997,4, subido a 36.000`.
- [ ] Intentar cambiar la moneda de esa venta con la línea ya cargada → lo rechaza y explica que hay precios en la moneda actual.
- [ ] Confirmar y comprobar en **Reportes › Ventas por período** que el monto en pesos es 2 × 36.000 y no 76.

#### 7.1.1 Imprimir la nota — botón «Imprimir nota»

Antes de empezar: cargar **RUT y teléfono** en Administración › Empresa. Salen en el encabezado de las cuatro copias y hoy están vacíos.

- [ ] Con la venta **en borrador**, pulsar «Imprimir nota»: se abre una pestaña con las cuatro copias y una banda negra **PRELIMINAR** en cada una, sin folio.
- [ ] Confirmar la venta y volver a imprimir: la banda desaparece y arriba a la derecha aparece el folio (`202600003` y siguientes).
- [ ] **Vendedor**: cliente completo, ubicaciones, precio unitario y subtotal por línea, total, y al pie los cuadros de régimen (REEXP / S.R.F. / TRASP. / REG. GEN. / OTROS) y del camión, en blanco.
- [ ] **Cliente**: no aparece **ninguna** zona ni bodega. Sí el precio unitario, el subtotal por línea y el TOTAL.
- [ ] **Bodega**: no aparece **ningún** precio. Las líneas van ordenadas por bodega y zona, con casilla para ir marcando.
- [ ] **Despacho**: agrupada por bodega, con la insignia de color y el subtotal de bultos de cada una.
- [ ] Desmarcar «Cliente» en la barra de arriba y comprobar en la vista previa del navegador que salen **3** hojas, no 4.
- [ ] Con el **tema oscuro** puesto, la hoja sigue siendo negra sobre blanco.
- [ ] En Bitácora queda un registro **IMPRIMIR** por cada vez que se abrió la vista.

#### 7.2 El tipo de cambio — `/maestros/tipo-cambio`

- [ ] Entrar como **Administrador**: se ve el dólar vigente en grande y la serie por fecha. Como **Ventas** el enlace no aparece.
- [ ] Cargar el dólar de hoy con otro valor (por ejemplo 960) y fuente «Banco Central de Chile».
- [ ] Volver a Notas de venta: una nota **nueva** en pesos usa 960; las anteriores **conservan** el suyo y sus precios no se movieron.

### 8. Toma de inventario — `/inventario/toma`

- [ ] Crear una toma para la bodega IQQ.
- [ ] Contar `ZH-8802` en la zona `2-4` declarando **352** cajas (el sistema dice 355).
- [ ] Aplicar la toma → el sistema genera solo el **ajuste negativo de 3 cajas**, y el stock queda en 352.
- [ ] El ajuste queda en el kardex con el nombre de quien lo hizo.

### 9. Reportes y exportación — `/reportes/*`, `/inventario/alertas`

- [ ] **Valorización**: total **$79,9 millones CLP** (más lo que se agregue en las pruebas), valorizado al último costo de importación.
- [ ] **Estadística mensual**: muestra las salidas del mes, incluida la venta recién hecha.
- [ ] **Ventas por período**: filtrar por fecha y ver la venta a Comercial Andina.
- [ ] **Alertas de stock**: aparecen `PL-7702` (115 cajas, mínimo 120) y `ZN-6103` (305, mínimo 350).
- [ ] **Exportar a Excel** desde un reporte: descarga el `.xlsx` y abre bien.

### 10. Bitácora — `/bitacora`

- [ ] Todo lo anterior está registrado: quién, qué, cuándo, y el antes/después de cada cambio.
- [ ] La exportación a Excel figura como acción **EXPORTAR**.
- [ ] No hay forma de editar ni borrar una línea desde la interfaz. **Es el punto que más le importa al cliente.**

---

## A3. Pruebas de lo que el sistema NO debe permitir

Estas son las que dan confianza. Conviene probarlas antes, y repetir una o dos
delante del cliente.

- [ ] **Sobregiro**: vender 5.000 cajas de `ZD-8801` cuando hay 380 → la venta falla **completa**, no deja stock negativo ni una venta a medias.
- [ ] **Doble confirmación**: confirmar dos veces la misma importación → se bloquea.
- [ ] **Editar un documento confirmado**: no se puede, y no por la pantalla, sino por la base de datos (es lo que impide arreglar los dos `203-TEST`).
- [ ] **Traspaso sin stock suficiente**: falla y no mueve nada.
- [ ] **Permisos**: entrar con el usuario **Bodeguero** → no ve Notas de venta, Listas de precios, Usuarios, Roles ni Bitácora. Con **Consulta** → solo lectura, sin botones de crear ni editar.
- [ ] **Saltarse el menú**: con la sesión de Consulta, escribir a mano `localhost:3001/ventas/notas` → pantalla «Sin permiso». Aunque alguien esquive la interfaz, la base de datos (RLS) no le entrega los datos.
- [ ] **Sin sesión**: cerrar sesión e intentar entrar a `/inventario/stock` → redirige al login.

Los permisos por rol hoy son:

| Rol           | Permisos     | Alcance                                                   |
| ------------- | ------------ | --------------------------------------------------------- |
| Administrador | 38           | Todo el sistema                                           |
| Ventas        | 17           | Clientes, precios, notas de venta, comisiones, reportes   |
| Bodeguero     | 16           | Stock, movimientos, traspasos, tomas, productos, reportes |
| Consulta      | 7            | Solo lectura de catálogo y stock                          |
| Superadmin    | acceso total | Desarrollo / TI                                           |

### Prueba automatizada (opcional, para respaldar lo anterior)

```bash
npm test
```

Corre los tests de integración **contra la base real**: sobregiro, concurrencia
de dos ventas simultáneas del mismo artículo, doble confirmación, inmutabilidad
de documentos y de la bitácora.

> **No correr `npm test` el día de la demo.** Los tests crean artículos, zonas y
> clientes `TEST…` y los borran al terminar; si se interrumpen a medias, vuelven
> a ensuciar el catálogo que acabamos de dejar presentable.

---

## B. Guion para la demostración al cliente (~25 min)

No mostrar pantalla por pantalla: **contar la historia de una caja de zapatos**
entrando y saliendo de la bodega.

**1. El problema (2 min).** Abrir `BODEGA.xls` al lado. Hoy el stock real vive
en una planilla que una sola persona mantiene a mano, sin saber quién cambió
qué ni cuándo.

**2. Entrar al sistema (2 min).** Login. Mostrar el catálogo: los artículos
tienen descripción en español y en chino, tallas, pares por caja y su
proveedor. Ir a Stock por zona: 2.785 cajas ubicadas estantería por estantería.

**3. Llega un contenedor (5 min).** Crear la importación con el proveedor y el
documento de aduana, cargar dos artículos, confirmar. Volver a Stock: la
mercadería ya está, en su ubicación y convertida a pares automáticamente.
_«Nadie sumó nada a mano.»_

**4. Se mueve mercadería a Arica (3 min).** Traspaso de 60 cajas de Iquique a
Arica. El total de la empresa no cambió, solo cambió de lugar, y quedaron dos
movimientos trazables.

**5. Se vende (4 min).** Nota de venta a Comercial Andina: el precio lo propone
la lista de ese cliente. Confirmar → el stock baja solo.

**6. Lo que no se puede hacer (4 min). El momento importante.** Intentar vender
5.000 cajas cuando hay 380: el sistema rechaza la operación entera. _«No existe
la posibilidad de dejar el stock en negativo, ni por error ni a propósito.»_
Después, con el usuario de bodega, mostrar que las pantallas de venta y de
usuarios simplemente no existen para él.

**7. Conteo físico (3 min).** Toma de inventario: el bodeguero cuenta 352 donde
el sistema decía 355, y el ajuste de 3 cajas queda registrado con su nombre.
_«La diferencia no se corrige a escondidas: queda escrita.»_

**8. Reportes (2 min).** Valorización del stock: **$79,9 millones** al último
costo de importación, y exportación a Excel — para quien hoy vive en Excel,
esto tranquiliza mucho.

**9. Bitácora (2 min). Cerrar con esto.** Filtrar por la fecha de hoy y mostrar
todo lo que se acaba de hacer en la demo, línea por línea, con usuario y hora.
Y decir la frase: **esta tabla no se puede editar ni borrar, tampoco por el
administrador**.

### Antes de la demo, revisar

- [ ] Sesión iniciada con el usuario **Administrador**, no con Superadmin: el cliente debe ver el sistema como lo verá su propio administrador.
- [ ] Idioma en español y tema claro (se ve mejor en proyector).
- [ ] Servidor `dev` corriendo desde hace rato y páginas ya visitadas una vez: la primera carga de cada ruta compila y demora.
- [ ] Bitácora filtrada por hoy, para que no se vean los 2.200 registros de pruebas.
- [ ] Ventanas cerradas: terminal, editor, panel de Supabase. El cliente ve un sistema, no un proyecto en construcción.
- [ ] Segunda sesión (ventana de incógnito) ya abierta como Bodeguero, para el punto 6 sin perder tiempo.
- [ ] **No haber corrido `npm test` ese día.**

### Qué decir si preguntan por lo que falta

Fase 1 (MVP) cubre catálogo, inventario, compras, ventas básicas, reportes y
seguridad. **Fuera de alcance por ahora:** facturación electrónica (SII/DTE),
documentos de aduana completos, código de barras/QR, app móvil y dashboards.
La migración de `BODEGA.xls` está desarrollada y probada, y se ejecuta cuando
el cliente entregue la planilla definitiva.

Los datos que se están mostrando son de demostración: artículos, clientes y
proveedores inventados con formato realista. **El RUT de la empresa sigue
pendiente** de confirmación del cliente, igual que la razón social definitiva.

---

## Problemas frecuentes

**La página se ve sin estilos, como HTML plano.** Se corrió `npm run build` con
el servidor de desarrollo encendido. Detener el servidor, borrar `.next`
(`Remove-Item -Recurse -Force .next`) y volver a `npm run dev`.

**El puerto 3001 está ocupado.** Ya hay un `npm run dev` corriendo — usar ese.
Para levantar otro: `npm run dev -- -p 4000`.

**«Su rol no tiene permiso para esta operación».** No es un error: es RLS
haciendo su trabajo. Revisar el rol del usuario con
`npx tsx scripts/asignar-rol.ts`.

**Un artículo no aparece en Stock por zona.** Esa pantalla solo muestra
existencias mayores que cero, y como máximo 500 filas. Para buscar cualquier
artículo, usar Buscar artículos.

**Volvieron a aparecer datos `TEST…`.** Se corrió `npm test` y se interrumpió.
Ver qué quedó y borrarlo:

```sql
select codigo from producto where codigo like 'TEST%';
```
