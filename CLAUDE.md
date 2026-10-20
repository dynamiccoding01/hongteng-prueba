# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

El proyecto está escrito **en español**: nombres de archivos, funciones, variables, comentarios, mensajes de UI, migraciones SQL y commits. Todo código nuevo sigue esa convención (`crearClienteServidor`, `guardarZona`, `acciones.ts`). El único inglés que se conserva es el de las APIs de terceros (Next.js, Supabase, Zod).

## Dónde está escrito cada cosa

La raíz tiene diez `.md` y se pisan poco: antes de abrir varios, buscar aquí.

| Documento                                                                                         | Qué contiene                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [BACKEND.md](BACKEND.md)                                                                          | El esquema tabla por tabla, el ERD y las reglas de negocio que viven en la base. La referencia larga.  |
| [FLUJO.md](FLUJO.md)                                                                              | Los procesos del negocio (compras, inventario, ventas, bitácora) con sus códigos de historia.          |
| [DESARROLLO.md](DESARROLLO.md)                                                                    | Puesta en marcha, aplicar el esquema sin el CLI de Supabase, crear el primer usuario.                  |
| [GUIA_PRUEBAS.md](GUIA_PRUEBAS.md)                                                                | Recorrido de pruebas, lo que el sistema **no** debe permitir y el guion de la demostración.            |
| [REVISION_CRITICA.md](REVISION_CRITICA.md)                                                        | Los fallos reales encontrados en revisión y el identificador de cada guardia (`D-01`, `P-02`, `G-11`). |
| [PLAN_AVANZE.md](PLAN_AVANZE.md)                                                                  | Fases, sprints y Definición de Terminado.                                                              |
| [UI_UX.md](UI_UX.md)                                                                              | Principios de diseño y pantallas.                                                                      |
| [PRD_REQUERIMIENTOS.md](PRD_REQUERIMIENTOS.md) · [TRD](<TRD_Documento de Requisitos Técnicos.md>) | Requisitos del cliente y requisitos técnicos. Origen de los códigos `MAE-02`, `INV-06`, `VEN-07`.      |
| [README.md](README.md)                                                                            | Contexto del cliente, alcance de la Fase 1 y buenas prácticas.                                         |

## Comandos

```bash
npm run dev          # servidor de desarrollo en http://localhost:3001
npm run build        # build de producción
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier sobre todo el repo (format:check en CI)
npm test             # Vitest (una pasada)
npm run test:watch   # Vitest en modo watch
```

Antes de abrir un PR, con el servidor de desarrollo **detenido**, correr exactamente lo que corre el CI:

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build
```

Nunca ejecutar `build` y `dev` a la vez: ambos escriben en `.next` y lo dejan inconsistente (la app aparece sin estilos). Se arregla borrando `.next`.

El servidor de desarrollo está declarado en `.claude/launch.json` con el nombre `inventario` (puerto 3001): para previsualizar, `preview_start { name: 'inventario' }` en vez de levantarlo por fuera. Si ya hay uno corriendo en el 3001 es el del usuario; no se reinicia ni se detiene.

### Un solo test / un subconjunto

```bash
npx vitest run lib/bodega/parse-zona.test.ts
npx vitest run lib/inventario -t "traspaso"
```

Hay tres clases de test, y el nombre del archivo dice cuál es:

- `*.test.ts` — lógica pura (`parse-zona`, `conversion`, `descuento`, `paginacion`, `fechas`). Corren siempre y en milisegundos.
- `*.regresion.test.ts` — **guardias**. Cada `it` describe un fallo que ocurrió de verdad y lleva el identificador con el que aparece en [REVISION_CRITICA.md](REVISION_CRITICA.md) (`D-01` … `D-08`, `P-01`, `F-02`, `E-01`…). El circuito de una revisión es: el hallazgo se escribe primero como test en rojo, después se corrige el código, y **el test queda**. No borrar uno porque «ya está arreglado»: eso es justamente lo que vigila. Al agregar un hallazgo nuevo, el identificador va en el `it` y en la tabla de REVISION_CRITICA.md.
- `*.integracion.test.ts` — contra el proyecto **Supabase real** vía Management API (`scripts/api-supabase.ts`); crean datos con un código único y los borran al terminar. Se auto-omiten (`describe.runIf`) si no existe `.env.local`, por eso pasan en CI sin credenciales.

Tres ajustes de [vitest.config.ts](vitest.config.ts) que son remedios, no preferencias: `fileParallelism: false` y `hookTimeout: 180_000` porque los tests de integración comparten el rate limit de la Management API —en paralelo da 429, y un `beforeAll` de quince consultas espaciadas no cabe en los 10 s por defecto—; y `exclude: ['.claude/**']` porque los worktrees que abre Claude Code son otra copia del repo: sin excluirlos cada test corre dos veces contra la **misma** base y revive tests de código ya borrado.

### Base de datos y utilidades

```bash
npm run db:migrar    # aplica migraciones pendientes al proyecto en la nube
npm run db:probar    # verifica conexión y qué tablas existen
npm run db:types     # regenera lib/supabase/database.types.ts desde el esquema
npm run db:sql       # SQL consolidado para pegar en el editor del panel
npm run db:reset     # supabase db reset — SOLO con el CLI local, borra la base
npx tsx scripts/asignar-rol.ts correo@ejemplo.com Administrador
npx tsx scripts/verificar-esquema.ts      # comprueba triggers, RLS, bitácora, stock
npx tsx scripts/ver-bitacora.ts [cantidad]   # últimos registros de la bitácora (20 por defecto)
npx tsx scripts/generar-planilla-prueba.ts   # BODEGA.xls sintética, para probar el migrador sin datos reales
npx tsx scripts/analizar-bodega.ts ruta/BODEGA.xls   # diagnóstico, no escribe
npm run migrar:bodega                  # ensayo de BODEGA.xls; escribe solo con `-- --ejecutar`
npx tsx scripts/migrar-catalogo.ts ruta/planilla.xlsx            # ensayo, no escribe
npx tsx scripts/migrar-catalogo.ts ruta/planilla.xlsx --ejecutar # migra el catálogo
```

Con Supabase CLI + Docker disponibles el flujo es `supabase start` / `supabase migration new <desc>` / `supabase db reset` / `npm run db:types`. Sin CLI, se usa la vía `db:sql` + editor SQL del panel (ver [DESARROLLO.md](DESARROLLO.md)).

## Arquitectura

Next.js 15 (App Router, React 19, Tailwind 4) sobre Supabase (PostgreSQL + Auth). No hay backend aparte: **la lógica de negocio vive en la base de datos**, y Next.js es la capa de presentación y validación.

### Qué módulos hay, y los que no son evidentes

`app/(app)/` agrupa por módulo —`maestros/`, `compras/`, `inventario/`, `ventas/`, `reportes/`, `admin/`— y cada carpeta tiene su `page.tsx` y, si escribe, su `acciones.ts`. Cuatro cosas que el árbol de archivos no dice:

- **`inventario/toma`** (INV-06) es toma de inventario físico: se cuenta contra lo que dice el sistema y al aplicarla **el ajuste de las diferencias lo genera ella sola**, como movimientos. No es un listado más.
- **`ventas/precios`** (VEN-04) son las listas de precios por moneda. Los precios no se teclean ahí: los publica la importación al confirmarse (ver § Precios).
- **Zona franca** tiene su migración (`0011_zona_franca.sql`) y todavía **no tiene interfaz**. Está en el esquema a propósito, para la Fase 3.
- **Comisiones ya no existen.** Se agregaron en `0012_comisiones.sql` y se retiraron en `0028_quitar_comisiones.sql`. `PLAN_AVANZE.md` y el PRD todavía las mencionan: no reimplementarlas sin pedirlo.

### Seguridad en tres capas — la real es RLS

1. `middleware.ts` refresca la sesión y redirige a `/login`. Usa `getUser()` (valida contra Supabase), nunca `getSession()`.
2. `app/(app)/layout.tsx` vuelve a exigir sesión; cada página llama `requerirPermiso('<codigo>')` de [lib/auth.ts](lib/auth.ts) y la navegación oculta enlaces sin permiso.
3. **RLS en PostgreSQL** (`0005_rls.sql`) consultando `tiene_permiso()` sobre usuario → rol → rol_permiso → permiso.

Las capas 1 y 2 son comodidad de UX: **la autorización que cuenta es la 3**. Nunca reemplazar una política RLS por una comprobación en la app.

**La sesión caduca a los 15 minutos de inactividad** ([lib/sesion.ts](lib/sesion.ts)). Supabase no lo hace solo: renueva el token mientras viva el refresh token, así que quien no cerraba sesión seguía dentro al día siguiente —inaceptable en un mostrador con el computador compartido—. La cuenta la lleva una cookie propia, `ultima_actividad`, que el middleware lee y reescribe en cada petición; pasado el plazo cierra la sesión y manda a `/login?expirada=1`. Dos detalles que parecen menores y no lo son: la cookie **ausente cuenta como caducada** (se emite con `maxAge` de 15 min, así que «volví al día siguiente» llega como ausencia, no como marca vieja; por eso `iniciarSesion` la escribe al entrar), y la **prerecarga de `<Link>` no renueva** el plazo, solo lo comprueba —si no, un menú en pantalla mantendría viva la sesión sin que nadie tocara nada—. `VigiaInactividad` ([components/vigia-inactividad.tsx](components/vigia-inactividad.tsx)) es el complemento en el navegador, para quien deja la pantalla abierta y no genera peticiones; comparte la marca entre pestañas por `localStorage` y sale con `window.location` —navegación dura— para que se vaya también la caché de rutas de Next. El vigía es comodidad; **la barrera es el middleware**.

El cliente de servidor ([lib/supabase/server.ts](lib/supabase/server.ts)) usa la clave pública con la sesión del usuario en cookies, para que RLS se evalúe con su identidad real. La `service_role key` (`getServiceRoleKey()` en [lib/env.ts](lib/env.ts)) omite RLS y solo puede usarse en scripts y código de servidor.

Supabase renombró sus claves: [lib/env.ts](lib/env.ts) acepta los dos nombres (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o el antiguo `..._ANON_KEY`; `SUPABASE_SECRET_KEY` o `..._SERVICE_ROLE_KEY`) y valida con Zod al arrancar. `SUPABASE_ACCESS_TOKEN` es aparte: es el PAT del panel que usan los scripts para ejecutar DDL vía Management API.

**Un reporte puede necesitar su propio permiso.** El de compras (`reporte_compras.ver`, migración 0034) existe porque conceder `importacion.ver` para que el reporte funcionara abría además el módulo Compras entero. Cuando una vista `security_invoker` deja fuera a quien sí debería ver el reporte, la salida es una función `security definer` que **empieza preguntando por el permiso** (`fn_compras_detalle`, `fn_compras_resumen`), no ensanchar un permiso existente.

`app/api/exportar/route.ts` es el **único** Route Handler: comprueba `reporte.exportar` en código —no hay página que lo cubra—, arma el `.xlsx` con `xlsx` y registra `EXPORTAR` en la bitácora.

Rol **Superadmin** (`0013_superadmin.sql`): `acceso_total` + `protegido`, para desarrollo/TI; un Administrador normal no lo ve ni lo asigna, y la jerarquía se aplica en RLS.

### Usuarios: el único lugar donde se omite RLS

`usuario.id` es FK contra `auth.users`, así que dar de alta a alguien exige crear antes su cuenta de autenticación, y eso solo se puede con la clave secreta ([lib/supabase/admin.ts](lib/supabase/admin.ts)). Ese cliente **omite RLS**, de modo que la regla es estricta: se usa **solo** para `auth.users` (crear cuenta, cambiar correo, cambiar contraseña). Todo lo que toque la tabla `usuario` va con `crearClienteServidor()`, para que sea RLS —y no un `if` en TypeScript— lo que impida que un Administrador se fabrique un Superadmin. `acciones.ts` de `/admin/usuarios` valida el rol destino leyéndolo con el cliente de sesión: si RLS no se lo muestra, no puede asignarlo.

Sin `SUPABASE_SECRET_KEY` configurada el sistema funciona completo salvo el alta de usuarios, que devuelve un aviso claro en vez de reventar.

### Patrón de página

Cada ruta bajo `app/(app)/` es un Server Component que:

1. `await requerirPermiso('stock.ver')`,
2. consulta con `crearClienteServidor()` (los `select` embebidos usan los tipos generados de `database.types.ts`),
3. renderiza con los primitivos de [components/ui.tsx](components/ui.tsx) (`Encabezado`, `Tabla`, `Th`, `Td`, `Vacio`, `numero`).

Las escrituras van en un `acciones.ts` hermano con `'use server'`: valida con Zod → escribe con el cliente de servidor → traduce el error de PostgREST con `mensajeError()` de [lib/errores.ts](lib/errores.ts) → `revalidatePath()` → devuelve `EstadoFormulario` (`{ ok }` o `{ error }`) para `useActionState`.

### Listados: siempre paginados

**Ninguna consulta de listado trae la tabla entera.** Toda página que muestre filas pagina en la base de datos, nunca en TypeScript: `.range(desde, hasta)` con `{ count: 'exact' }`, y el usuario elige cuántas filas ver entre **10, 15 y 20**.

El circuito es siempre el mismo:

1. `const { pagina, porPagina, desde, hasta } = leerPaginacion(searchParams)` de [lib/paginacion.ts](lib/paginacion.ts);
2. la consulta lleva `.select('…', { count: 'exact' }).range(desde, hasta)`;
3. debajo de la tabla va `<Paginacion total={count ?? 0} pagina={pagina} porPagina={porPagina} />` ([components/paginacion.tsx](components/paginacion.tsx)).

`pagina` y `filas` viajan en la URL, así que una vista concreta se puede compartir o recargar. Cualquier filtro nuevo debe borrar `pagina` al aplicarse (si no, el usuario queda en una página 7 que ya no existe): `Buscador` y `Paginacion` ya lo hacen.

Traer todo y cortar con `.slice()` no es paginar: la consulta ya cruzó la red. Un `.limit(200)` tampoco — oculta filas sin decirlo.

**Los totales tampoco se suman en TypeScript.** Un `select` sin `range` ni `limit` no trae el período entero: PostgREST lo corta en `db-max-rows` (1000 por defecto) **sin decirlo**, y el total que se pinta es un número corto con toda la pinta de estar bien. Los agregados se calculan en la base —`fn_ventas_resumen`, `fn_compras_resumen` (migración 0033)— y la página solo los pinta. Si una consulta puede devolver más filas de las que caben, o pagina o agrega; no hay tercera opción.

### Capa de cliente

Los Client Components son pocos y acotados; casi todo se renderiza en el servidor. Las convenciones que ya están resueltas y no hay que reinventar:

- **Altas y ediciones**: `FormularioDesplegable` de [components/formulario.tsx](components/formulario.tsx) con `Campo` / `Seleccion` / `AreaTexto` dentro. Es un modal centrado (`createPortal` sobre `document.body`) que se abre desde un botón, se cierra solo al guardar y bloquea el scroll de fondo. Lo usan casi todas las pantallas de alta y edición del sistema: no escribir un `<form action={...}>` a mano para un CRUD.
- **Validación en el formulario**: `Campo` acepta `requerido`, `largoMax`, `minimo`/`maximo`, `patron` y `ayuda`; son ayuda inmediata para quien escribe, **no** la validación —esa es el esquema Zod del `acciones.ts`—, y los dos deben decir lo mismo. Si la acción normaliza el texto antes de guardar (mayúsculas, sin espacios), el campo lleva `transformar` para hacerlo mientras se escribe: un formulario no puede pintar en rojo lo que él mismo iba a corregir. El rojo es `user-invalid:`, nunca `invalid:`, que marcaría todo lo obligatorio al abrir.
- **Baja lógica visible**: toda tabla con columna `activo` lleva su `Seleccion` de Estado en el formulario. Una fila que la interfaz muestra como «Inactivo» pero no deja desactivar es una columna muerta. `Seleccion` oculta la opción vacía cuando el campo es obligatorio y ya trae un valor válido, y la vuelve a mostrar si ese valor ya no está entre las opciones —el maestro se desactivó—, para que el navegador no reasigne solo a la primera de la lista.
- **Avisos**: el `{ ok }` / `{ error }` de la acción se convierte en toast dentro de `FormularioDesplegable` vía `useToast()` ([components/proveedor-toast.tsx](components/proveedor-toast.tsx)). No renderizar mensajes de error inline en la página.
- **Capas**: la escala está documentada en [app/globals.css](app/globals.css) — velo móvil `z-40`, menú `z-50`, modal `z-60`, toast `z-70`. Empatar el z-index del modal **no** alcanza: se monta con `createPortal` sobre `document.body`, así que con el mismo número queda encima por orden del DOM. Todo lo que deba verse sobre un modal necesita un número mayor.
- **Carcasa**: [components/marco.tsx](components/marco.tsx) gobierna solo abrir/cerrar el menú en móvil. La navegación se calcula en el servidor —incluido el filtrado por permisos— y le llega ya renderizada como prop: `Marco` nunca conoce permisos.
- **Colores**: usar siempre los tokens semánticos de [app/globals.css](app/globals.css) (`bg-fondo`, `bg-superficie`, `bg-menu`, `border-borde`, `text-tenue`, `bg-acento`). El variante `dark:` está reasignado a `[data-theme='oscuro']`, no al media query; los grises fijos de Tailwind rompen el cambio de tema.
- **Color de bodega**: `bodega.color` (migraciones `0016`–`0018`) identifica cada recinto en pantalla. **No es un campo del formulario**: `fn_asignar_color_bodega` le da a cada alta el primer color libre de la paleta, y `fn_color_bodega_inmutable` impide cambiarlo después. Va en la base y no en el `acciones.ts` porque elegir «el primer color libre» en TypeScript sería leer y luego escribir, con una carrera en medio. `'gris'` es el default de la columna y significa _sin asignar_: el trigger lo reemplaza. La paleta es **cerrada** —`bodega_color_ck` en la base, [lib/colores-bodega.ts](lib/colores-bodega.ts) en la interfaz— porque un color libre desaparece en el tema oscuro. Las clases se guardan **completas** (`bg-sky-100 …`): Tailwind busca literales en el código, y un `bg-${color}-100` no llega al CSS generado. Se pinta con `DistintivoBodega` / `PuntoBodega` y se elige bodega con `SelectorBodega` de [components/color-bodega.tsx](components/color-bodega.tsx), Server Component: un grupo de `radio` con `peer-checked:`, sin estado ni JavaScript.

`EstadoFormulario` está declarado dos veces con la misma forma: [lib/errores.ts](lib/errores.ts) es el que importan los `acciones.ts`; el de `components/formulario.tsx` existe para no arrastrar código de servidor al cliente.

**Un solo modal.** `FormularioDesplegable` es el único componente con `role="dialog"` del sistema, así que su ancho y su aire se deciden ahí y alcanzan a todas las pantallas a la vez. No escribir otro.

### Documentos impresos

Las vistas para imprimir viven en el grupo de rutas `app/(impresion)/`, **aparte de `(app)`**: no llevan menú, ni cabecera, ni proveedores de tema o de avisos. La autorización sigue siendo la misma (`requerirPermiso` en la página, RLS en la base); lo que cambia es que no hay carcasa que después haya que acordarse de esconder al imprimir.

Reglas de una hoja que va a papel:

- **Nada de tokens de tema ni de `dark:`.** El variante está atado a `[data-theme='oscuro']` en `<html>` y alcanza a todo descendiente, así que un contenedor «claro» no lo apaga: una nota impresa por alguien con el tema oscuro saldría blanca sobre negro. Los colores se escriben explícitos (`bg-white`, `text-zinc-900`). Por eso `COLORES_BODEGA` tiene `impreso` además de `distintivo`.
- **El color nunca es el único dato.** Las insignias de bodega llevan siempre el código escrito al lado: en una impresora en blanco y negro el relleno desaparece.
- El bloque `@media print` de [app/globals.css](app/globals.css) gobierna tamaño de página, saltos (`.hoja`), lo que no se imprime (`.no-imprimir`) y lo que no se parte entre páginas (`.sin-partir`).
- Imprimir se registra en la bitácora con `registrarEnBitacora('IMPRIMIR', …)`. Un documento impreso circula fuera del sistema; el registro es lo único que permite reconstruir después qué salió.

`/imprimir/venta/[id]` son **cuatro copias en una sola vista**, y cada una existe porque la lee alguien distinto: vendedor (todo), cliente (sin ubicaciones, que son información interna), bodega (sin un solo precio, ordenada por recorrido de bodega y con casilla para marcar) y despacho (agrupada por bodega, con los datos del camión en blanco). Se elige cuáles salen y se imprimen juntas.

### Agregar una página nueva

Una ruta no queda visible solo con crear su `page.tsx`. El circuito completo toca cinco lugares:

1. `app/(app)/<ruta>/page.tsx` con `requerirPermiso('<codigo>')` y, si escribe, su `acciones.ts` hermano.
2. El permiso `<codigo>` insertado en una migración y concedido a los roles que corresponda (RLS lo exige de verdad).
3. Una entrada en `SECCIONES` de [components/navegacion.tsx](components/navegacion.tsx) con su `permiso` — sin él, el enlace se muestra a todos.
4. El icono en `ICONOS` de [components/iconos.tsx](components/iconos.tsx) (el tipo `NombreIcono` se deriva de ahí).
5. La clave del enlace en **ambos** idiomas de [lib/i18n.ts](lib/i18n.ts): el diccionario es un objeto tipado y falta una clave rompe el typecheck.

### Producto: el envase y lo que trae dentro

**El envase se llama por su unidad de medida; lo de dentro son unidades.** Esta es la frase de la que cuelga todo el vocabulario de la interfaz, y conviene leerla antes de escribir cualquier texto que hable de cantidades.

- `producto.unidad_medida_id` → maestro `unidad_medida` (MAE-07). **Cómo se cuenta** el artículo: la caja, la docena, el par o el bulto en que entra, se guarda y se vende. Lo administra el cliente desde `/maestros/unidades`; era un enum fijo hasta la migración `0014`. En pantalla el campo se llama **«Se cuenta por»**.
- Las frases se arman con `nombreEnvase()` y `piezas()` de [lib/inventario/articulo.ts](lib/inventario/articulo.ts), nunca escribiendo «caja» a mano: «10 docenas × 8 unidades = 80 unidades», «A2050 — docena de 8 unidades». `nombreEnvase` pluraliza con una regla —vocal `+s`, consonante `+es`— y una tabla de excepciones para las palabras prestadas (`pack`, `set`, `display`). Sin unidad dice «empaque», que es también la palabra para las tablas que mezclan artículos y no pueden nombrar un envase concreto.
- Hasta el 19-10-2026 la palabra «caja» estaba escrita a mano en cada frase y la unidad de medida se leía como el **contenido**: un artículo con unidad «docena» y 8 por caja salía como «8 docena por caja» y «10 cajas × 8 docena = 80 docena», que no es lo que nadie quiso decir. Había una función, `unidadLegible()`, que lo tapaba imprimiendo «unidades» cuando la unidad contenía la palabra caja; desapareció con el arreglo. Si alguien vuelve a necesitar un apaño así, la pregunta correcta es si el envase y su contenido han vuelto a competir por el mismo hueco.
- **Ese cambio es de palabras, no de datos.** `unidad_medida_id` no entra en ningún cálculo —solo rotula—, y por eso los 1.700 artículos que dicen «Caja» están bien: dicen «lo que guardo es una caja y dentro vienen N unidades». No «corregirlos» a PAR o PIEZA sin hablarlo con el cliente.
- `producto_variante.unidades_por_caja` (MAE-02) → **cuántas unidades trae la caja**; en pantalla se llama «Cantidad unidades». No es descriptivo: es el factor con el que `fn_aplicar_movimiento` convierte cajas a unidades. Mientras el empaque no tenga kardex se puede corregir; en cuanto lo tiene queda sellado (`tr_variante_cantidad_inmutable`, `0019`) y la salida es agregar otra cantidad, no editar la existente. Un empaque se retira desactivándolo, y solo si ya no tiene existencia (`tr_variante_desactivar`, `0021`): con cajas dentro quedarían inalcanzables, porque un empaque inactivo no admite movimientos. Los cuatro datos del empaque —cantidad, código de barras, SKU y stock mínimo— se editan en el mismo formulario del listado de productos.

### Inventario: nunca se escribe `stock` directamente

`stock` es una tabla derivada. Se modifica **solo** insertando en `movimiento`, y el trigger `fn_aplicar_movimiento` recalcula existencias, convierte cajas ⇄ unidades (`unidades_por_caja` de la variante) y deja el saldo para el kardex. Reglas que ya están en la base y no deben duplicarse en TypeScript:

Sus columnas son `cantidad` (cuántos empaques hay) y `total_unidades` (`cantidad × unidades_por_caja`), renombradas en `0020`. **`movimiento.cajas` y `movimiento.unidades` no cambiaron**: ahí sí son las cajas movidas en esa operación, y el kardex es append-only. Al renombrar columnas hay que rehacer las funciones plpgsql —guardan su cuerpo como texto y no se actualizan solas— y las vistas que expongan esos nombres.

- Sobregiro imposible (`check (cajas >= 0)`), la transacción falla completa.
- Concurrencia serializada con `select ... for update` sobre la fila de `stock`.
- Traspaso = una transacción con `TRASPASO_SALIDA` + `TRASPASO_ENTRADA`.
- Anulación = movimiento inverso. **Jamás `UPDATE`/`DELETE` sobre `movimiento`.**
- Documentos (importación, venta) van BORRADOR → CONFIRMADA; confirmar genera los movimientos y sella el documento a nivel de base de datos (`fn_confirmar_importacion`, `fn_confirmar_venta`). **Y exige importe en todas las líneas** (migración 0032): sin precio o sin costo el documento se confirmaba igual, la mercadería salía de bodega y el `subtotal` nulo se sumaba como cero en todos los reportes.

### Precios: se deciden en dólares, se cobran en la moneda de la venta

La moneda de referencia es el **dólar**, porque es en la que se compra: es la única en la que costo y precio de venta son comparables sin arrastrar una conversión del día. De ahí las tres reglas, todas en la base y no en un formulario:

- **Importación siempre en USD** (`tr_importacion_solo_usd`, `0024`). El costo y el precio de venta se registran juntos en `importacion_detalle` —por eso `importacion_detalle_margen_ck` puede exigir que la venta no sea menor al costo sin convertir nada— y al confirmar se publican en la lista de precios de esa moneda.
- **Una sola lista activa, o los precios no salen solos.** La lista **no se reparte cliente por cliente**: mientras haya una sola activa, es la de todos, y `cliente.lista_precio_id` solo se respeta si ya trae valor —la pantalla dejó de asignarla porque era un paso que nadie recordaba, y el cliente recién creado se quedaba sin precios en silencio—. Con dos listas activas en la misma moneda el sistema **no elige**: ni `fn_confirmar_importacion` publica, ni `precioDeLista` resuelve. No es un descuido, es la misma regla en los dos lados —adivinar con precios cuesta dinero—, pero es una avería invisible: basta una segunda lista vacía para que el canal automático quede apagado sin que nadie se entere. Por eso la pantalla avisa cuando hay más de una, y por eso se pueden desactivar desde ahí.
- **Cuando no hay precio, se dice.** `precioDeLista` no devuelve `null` para significar «no sé»: devuelve el motivo (`sin_lista`, `articulo_sin_precio`, `moneda_no_soportada`, `tipo_cambio_invalido`) y la acción lo convierte en una frase que explica qué falta. Una línea sin precio guardada sin aviso parece una avería del sistema y no lo es.
- **Venta en USD o CLP** (`fn_venta_moneda`, `0025`), y la moneda **no cambia** mientras haya detalle: `venta_detalle.precio_caja` no guarda moneda propia —se lee en la de la cabecera—, así que cambiarla convertiría 38 dólares en 38 pesos sin tocar una fila del detalle.
- **En pesos se convierte**: precio de lista × tipo de cambio de la venta, **subido a la centena** (`lib/ventas/conversion.ts`). Hacia arriba, no al más cercano: redondear hacia abajo vendería por menos de lo fijado en dólares, y ese descuento no lo decidió nadie.
- **El descuento se acuerda por artículo y se guarda como rebaja** (`venta_detalle.descuento`, migración `0029`). En pantalla se escribe el subtotal —«son 5.950», «déjemelo en 5.900»— porque es como se negocia en el mostrador, pero lo que se guarda es la resta: `precio_caja` tiene que seguir siendo el de lista para que dos ventas sean comparables y para que «cuánto se rebajó» sea una consulta y no una reconstrucción. El subtotal es una **columna generada** (`cajas × precio_caja − descuento`): no se escribe, y ninguna página lo recalcula por su cuenta. El descuento no puede ser negativo ni superar el importe de la línea, y sin precio va en 0 (`venta_detalle_descuento_ck`). La cuenta vive en `lib/ventas/descuento.ts` y se hace **en enteros** (`bigint`, en millonésimas: los dos decimales de `cajas` más los cuatro de `precio_caja`), porque la base multiplica exacto y un redondeo que sube deja el descuento por encima del importe real —`venta_detalle_descuento_ck` rechaza la línea con jerga de PostgreSQL—. La rebaja final se trunca **hacia abajo**: recortar a la baja cobra una diezmilésima de más; redondear al cercano cobra de menos, y ese descuento no lo decidió nadie. La acción rehace la cuenta en el servidor contra el precio que él mismo resolvió, nunca contra lo que venga del formulario. Y «no vino el subtotal» significa dos cosas distintas: al agregar una línea, sin descuento; al corregirla, que la rebaja acordada sigue en pie (`descuentoVigente`) — recalcularla como cero la borraba en silencio. **Cuánto se puede rebajar lo decide `rol.descuento_maximo`** (migración 0035): un porcentaje por rol, `null` = sin tope, que hace cumplir un trigger y que la pantalla escribe como una cifra —«puede bajarlo hasta 5.355»— y no como el porcentaje.

`tipo_cambio` en un documento significa **cuántos pesos vale un dólar en ese documento**, y está siempre (`not null`), vaya el documento en pesos o en dólares. Lo pone `fn_documento_tipo_cambio` con `fn_tipo_cambio_vigente(fecha)` al crearlo y queda congelado; nadie lo teclea, ni en la venta ni en la importación. Se mantiene en **Maestros › Tipo de cambio** (`moneda.editar`), un valor por fecha, y corregir una fila no reescribe documentos ya emitidos.

Ese `not null` no es cosmética. Cuando la columna admitía nulos, las vistas de reportes convertían con `coalesce(tipo_cambio, 1)` usando el nulo como señal de «esto ya está en pesos», y una venta en dólares sin tipo de cambio se reportaba como si un dólar valiera un peso. **Al valorizar hay que preguntar por la moneda, nunca deducirla de un nulo** (`v_ventas_detalle`, `v_valorizacion`, `fn_confirmar_venta`).

### Bitácora — obligatoria, no opcional

Toda tabla operativa nueva declara su trigger en la misma migración:

```sql
create trigger tr_bitacora_<tabla>
  after insert or update or delete on <tabla>
  for each row execute function fn_bitacora();
```

Para acciones que no son cambios de tabla (login, exportar, imprimir) se usa `registrarEnBitacora()` de `lib/auth.ts` o el RPC `registrar_en_bitacora`. La tabla `bitacora` es append-only e inmutable (`fn_bitacora_inmutable`).

### Migraciones

`supabase/migrations/` es la **única fuente de verdad** del esquema; se aplican en orden alfabético, por eso van numeradas (`0001_utilidades` … `0035_tope_descuento_rol`, el último aplicado). Una migración ya aplicada **no se edita**: se corrige con otra encima, y por eso la historia tiene enmiendas (`0006` arregla `fn_aplicar_movimiento` de `0004`, `0018` el color de `0016`, `0028` retira las comisiones de `0012`). Nunca cambiar el esquema desde el panel de Supabase. Tras una migración, regenerar los tipos con `npm run db:types` — `lib/supabase/database.types.ts` es generado, no se edita a mano.

Convenciones del esquema (detalle en [BACKEND.md § 3](BACKEND.md)): `snake_case`, tablas en **singular**, PK `bigint generated always as identity` (nunca el código de negocio), `created_at`/`updated_at` en toda tabla, `activo` para borrado lógico, dinero `numeric(14,4)` (jamás `float`), texto `text`.

### i18n y preferencias

[lib/i18n.ts](lib/i18n.ts) traduce **solo la interfaz fija** (menú, botones comunes, Ajustes) a ES/中文; el contenido de las páginas sigue en español a propósito. Idioma y tema se leen en el servidor (`lib/preferencias.ts`) y se guardan con Server Actions.

## Definición de Terminado

Una historia no está terminada si le falta alguno de estos puntos (ver [PLAN_AVANZE.md](PLAN_AVANZE.md) y [BACKEND.md § Buenas prácticas](BACKEND.md)):

- PR revisado — **nunca push directo a `main`** — con CI verde (format, lint, typecheck, tests, build; Node 22 en CI, `>=20.9` en `engines`).
- TypeScript `strict` sin `any`; toda entrada validada con Zod en el borde. `tsconfig.json` va más allá de `strict`: con `noUncheckedIndexedAccess`, `datos[0]` es `T | undefined` y hay que estrecharlo (de ahí los `?? ` en el código), y `noUnusedLocals`/`noUnusedParameters` convierten un import olvidado en error de build.
- Migración versionada, reproducible desde cero, con **RLS y política escrita** para cada tabla nueva.
- Trigger de bitácora declarado en cada tabla operativa nueva.
- Tests unitarios de la lógica; de integración si toca stock, incluida concurrencia. Si el cambio nace de un fallo encontrado en revisión, su guardia va en el `*.regresion.test.ts` que corresponda, con identificador, y la tabla de `REVISION_CRITICA.md` lo registra.
- Documentación actualizada en el **mismo** PR (`BACKEND.md`, `FLUJO.md`, `DESARROLLO.md`, `PLAN_AVANZE.md`, y `GUIA_PRUEBAS.md` si cambia el guion de demostración o los datos de prueba).

Commits convencionales (`feat:`, `fix:`, `docs:`, `refactor:`) con descripción en español.

## Datos del cliente

`BODEGA.xls` y cualquier planilla con datos reales **no se versionan** (`.gitignore` excluye `*.xls` y `*.xlsx`). La ruta se pasa por `BODEGA_XLS_PATH`. El parser vive en `lib/bodega/` con sus tests unitarios (zonas en texto libre tipo `1-3 (2)M3(1)`), y `scripts/migrar-bodega.ts` valida totales contra la hoja 汇总 antes de escribir.

`scripts/migrar-catalogo.ts` es la migración de la planilla «bodegas ok.xlsx» (hecha el 2026-09-06: 1.690 productos, 18.143 cajas en IQQ). Reutiliza `parseZona` porque la columna UBICACIÓN trae la misma sintaxis compuesta. Tres cosas que no son evidentes al leer la planilla: **la hoja no tiene columna de categoría** —está partida en bloques por un separador en la columna del código (`（juvenil)`, `（adulto)`, `（ropa)`; lo anterior es Niño) y el encabezado se repite en cada bloque—; se carga **STOCK DISP.**, no `INGR − VDO`, porque en 275 filas esa resta no cuadra y el disponible es lo que el cliente mantiene al día; y **UNIDADES es el contenido de la caja**, que va a `producto_variante.unidades_por_caja`, mientras la unidad de medida de todo el catálogo es `CAJ`. Corre en ensayo por defecto: escribe solo con `--ejecutar`, y se niega a correr dos veces sobre las mismas zonas para no duplicar existencias.
