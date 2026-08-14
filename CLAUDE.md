# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

El proyecto está escrito **en español**: nombres de archivos, funciones, variables, comentarios, mensajes de UI, migraciones SQL y commits. Todo código nuevo sigue esa convención (`crearClienteServidor`, `guardarZona`, `acciones.ts`). El único inglés que se conserva es el de las APIs de terceros (Next.js, Supabase, Zod).

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

### Un solo test / un subconjunto

```bash
npx vitest run lib/bodega/parse-zona.test.ts
npx vitest run lib/inventario -t "traspaso"
```

Los tests `*.integracion.test.ts` corren contra el proyecto **Supabase real** vía Management API (`scripts/api-supabase.ts`), crean datos con un código único y los borran al terminar. Se auto-omiten (`describe.runIf`) si no existe `.env.local` — por eso pasan en CI sin credenciales. `vitest.config.ts` fuerza `fileParallelism: false` por el rate limit de la Management API.

### Base de datos y utilidades

```bash
npm run db:migrar    # aplica migraciones pendientes al proyecto en la nube
npm run db:probar    # verifica conexión y qué tablas existen
npm run db:types     # regenera lib/supabase/database.types.ts desde el esquema
npm run db:sql       # SQL consolidado para pegar en el editor del panel
npx tsx scripts/asignar-rol.ts correo@ejemplo.com Administrador
npx tsx scripts/verificar-esquema.ts      # comprueba triggers, RLS, bitácora, stock
npx tsx scripts/analizar-bodega.ts ruta/BODEGA.xls   # diagnóstico, no escribe
```

Con Supabase CLI + Docker disponibles el flujo es `supabase start` / `supabase migration new <desc>` / `supabase db reset` / `npm run db:types`. Sin CLI, se usa la vía `db:sql` + editor SQL del panel (ver [DESARROLLO.md](DESARROLLO.md)).

## Arquitectura

Next.js 15 (App Router, React 19, Tailwind 4) sobre Supabase (PostgreSQL + Auth). No hay backend aparte: **la lógica de negocio vive en la base de datos**, y Next.js es la capa de presentación y validación.

### Seguridad en tres capas — la real es RLS

1. `middleware.ts` refresca la sesión y redirige a `/login`. Usa `getUser()` (valida contra Supabase), nunca `getSession()`.
2. `app/(app)/layout.tsx` vuelve a exigir sesión; cada página llama `requerirPermiso('<codigo>')` de [lib/auth.ts](lib/auth.ts) y la navegación oculta enlaces sin permiso.
3. **RLS en PostgreSQL** (`0005_rls.sql`) consultando `tiene_permiso()` sobre usuario → rol → rol_permiso → permiso.

Las capas 1 y 2 son comodidad de UX: **la autorización que cuenta es la 3**. Nunca reemplazar una política RLS por una comprobación en la app.

El cliente de servidor ([lib/supabase/server.ts](lib/supabase/server.ts)) usa la clave pública con la sesión del usuario en cookies, para que RLS se evalúe con su identidad real. La `service_role key` (`getServiceRoleKey()` en [lib/env.ts](lib/env.ts)) omite RLS y solo puede usarse en scripts y código de servidor.

Supabase renombró sus claves: [lib/env.ts](lib/env.ts) acepta los dos nombres (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o el antiguo `..._ANON_KEY`; `SUPABASE_SECRET_KEY` o `..._SERVICE_ROLE_KEY`) y valida con Zod al arrancar. `SUPABASE_ACCESS_TOKEN` es aparte: es el PAT del panel que usan los scripts para ejecutar DDL vía Management API.

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

### Capa de cliente

Los Client Components son pocos y acotados; casi todo se renderiza en el servidor. Las convenciones que ya están resueltas y no hay que reinventar:

- **Altas y ediciones**: `FormularioDesplegable` de [components/formulario.tsx](components/formulario.tsx) con `Campo` / `Seleccion` / `AreaTexto` dentro. Es un modal centrado (`createPortal` sobre `document.body`) que se abre desde un botón, se cierra solo al guardar y bloquea el scroll de fondo. Ya lo usan 18 páginas: no escribir un `<form action={...}>` a mano para un CRUD.
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

### Producto: dos conceptos que se confunden

- `producto.unidad_medida_id` → maestro `unidad_medida` (MAE-07). **En qué se cuenta** el artículo: par, pieza, juego. Lo administra el cliente desde `/maestros/unidades`; era un enum fijo hasta la migración `0014`.
- `producto_variante.unidades_por_caja` (MAE-02) → **cuántas unidades trae la caja**; en pantalla se llama «Cantidad unidades». No es descriptivo: es el factor con el que `fn_aplicar_movimiento` convierte cajas a unidades. Mientras el empaque no tenga kardex se puede corregir; en cuanto lo tiene queda sellado (`tr_variante_cantidad_inmutable`, `0019`) y la salida es agregar otra cantidad, no editar la existente. Un empaque se retira desactivándolo, y solo si ya no tiene existencia (`tr_variante_desactivar`, `0021`): con cajas dentro quedarían inalcanzables, porque un empaque inactivo no admite movimientos. Los cuatro datos del empaque —cantidad, código de barras, SKU y stock mínimo— se editan en el mismo formulario del listado de productos.

### Inventario: nunca se escribe `stock` directamente

`stock` es una tabla derivada. Se modifica **solo** insertando en `movimiento`, y el trigger `fn_aplicar_movimiento` recalcula existencias, convierte cajas ⇄ unidades (`unidades_por_caja` de la variante) y deja el saldo para el kardex. Reglas que ya están en la base y no deben duplicarse en TypeScript:

Sus columnas son `cantidad` (cuántos empaques hay) y `total_unidades` (`cantidad × unidades_por_caja`), renombradas en `0020`. **`movimiento.cajas` y `movimiento.unidades` no cambiaron**: ahí sí son las cajas movidas en esa operación, y el kardex es append-only. Al renombrar columnas hay que rehacer las funciones plpgsql —guardan su cuerpo como texto y no se actualizan solas— y las vistas que expongan esos nombres.

- Sobregiro imposible (`check (cajas >= 0)`), la transacción falla completa.
- Concurrencia serializada con `select ... for update` sobre la fila de `stock`.
- Traspaso = una transacción con `TRASPASO_SALIDA` + `TRASPASO_ENTRADA`.
- Anulación = movimiento inverso. **Jamás `UPDATE`/`DELETE` sobre `movimiento`.**
- Documentos (importación, venta) van BORRADOR → CONFIRMADA; confirmar genera los movimientos y sella el documento a nivel de base de datos (`fn_confirmar_importacion`, `fn_confirmar_venta`).

### Precios: se deciden en dólares, se cobran en la moneda de la venta

La moneda de referencia es el **dólar**, porque es en la que se compra: es la única en la que costo y precio de venta son comparables sin arrastrar una conversión del día. De ahí las tres reglas, todas en la base y no en un formulario:

- **Importación siempre en USD** (`tr_importacion_solo_usd`, `0024`). El costo y el precio de venta se registran juntos en `importacion_detalle` —por eso `importacion_detalle_margen_ck` puede exigir que la venta no sea menor al costo sin convertir nada— y al confirmar se publican en la lista de precios de esa moneda.
- **Venta en USD o CLP** (`fn_venta_moneda`, `0025`), y la moneda **no cambia** mientras haya detalle: `venta_detalle.precio_caja` no guarda moneda propia —se lee en la de la cabecera—, así que cambiarla convertiría 38 dólares en 38 pesos sin tocar una fila del detalle.
- **En pesos se convierte**: precio de lista × tipo de cambio de la venta, **subido a la centena** (`lib/ventas/conversion.ts`). Hacia arriba, no al más cercano: redondear hacia abajo vendería por menos de lo fijado en dólares, y ese descuento no lo decidió nadie.

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

`supabase/migrations/` es la **única fuente de verdad** del esquema; se aplican en orden alfabético, por eso van numeradas (`0001_utilidades` … `0014_unidad_medida`). Nunca cambiar el esquema desde el panel de Supabase. Tras una migración, regenerar los tipos con `npm run db:types` — `lib/supabase/database.types.ts` es generado, no se edita a mano.

Convenciones del esquema (detalle en [BACKEND.md § 3](BACKEND.md)): `snake_case`, tablas en **singular**, PK `bigint generated always as identity` (nunca el código de negocio), `created_at`/`updated_at` en toda tabla, `activo` para borrado lógico, dinero `numeric(14,4)` (jamás `float`), texto `text`.

### i18n y preferencias

[lib/i18n.ts](lib/i18n.ts) traduce **solo la interfaz fija** (menú, botones comunes, Ajustes) a ES/中文; el contenido de las páginas sigue en español a propósito. Idioma y tema se leen en el servidor (`lib/preferencias.ts`) y se guardan con Server Actions.

## Definición de Terminado

Una historia no está terminada si le falta alguno de estos puntos (ver [PLAN_AVANZE.md](PLAN_AVANZE.md) y [BACKEND.md § Buenas prácticas](BACKEND.md)):

- PR revisado — **nunca push directo a `main`** — con CI verde (format, lint, typecheck, tests, build; Node 22 en CI, `>=20.9` en `engines`).
- TypeScript `strict` sin `any`; toda entrada validada con Zod en el borde. `tsconfig.json` va más allá de `strict`: con `noUncheckedIndexedAccess`, `datos[0]` es `T | undefined` y hay que estrecharlo (de ahí los `?? ` en el código), y `noUnusedLocals`/`noUnusedParameters` convierten un import olvidado en error de build.
- Migración versionada, reproducible desde cero, con **RLS y política escrita** para cada tabla nueva.
- Trigger de bitácora declarado en cada tabla operativa nueva.
- Tests unitarios de la lógica; de integración si toca stock, incluida concurrencia.
- Documentación actualizada en el **mismo** PR (`BACKEND.md`, `FLUJO.md`, `DESARROLLO.md`, `PLAN_AVANZE.md`, y `GUIA_PRUEBAS.md` si cambia el guion de demostración o los datos de prueba).

Commits convencionales (`feat:`, `fix:`, `docs:`, `refactor:`) con descripción en español.

## Datos del cliente

`BODEGA.xls` y cualquier planilla con datos reales **no se versionan** (`.gitignore` excluye `*.xls`). La ruta se pasa por `BODEGA_XLS_PATH`. El parser vive en `lib/bodega/` con sus tests unitarios (zonas en texto libre tipo `1-3 (2)M3(1)`), y `scripts/migrar-bodega.ts` valida totales contra la hoja 汇总 antes de escribir.
