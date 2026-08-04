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

Rol **Superadmin** (`0013_superadmin.sql`): `acceso_total` + `protegido`, para desarrollo/TI; un Administrador normal no lo ve ni lo asigna, y la jerarquía se aplica en RLS.

### Patrón de página

Cada ruta bajo `app/(app)/` es un Server Component que:

1. `await requerirPermiso('stock.ver')`,
2. consulta con `crearClienteServidor()` (los `select` embebidos usan los tipos generados de `database.types.ts`),
3. renderiza con los primitivos de [components/ui.tsx](components/ui.tsx) (`Encabezado`, `Tabla`, `Th`, `Td`, `Vacio`, `numero`).

Las escrituras van en un `acciones.ts` hermano con `'use server'`: valida con Zod → escribe con el cliente de servidor → traduce el error de PostgREST con `mensajeError()` de [lib/errores.ts](lib/errores.ts) → `revalidatePath()` → devuelve `EstadoFormulario` (`{ ok }` o `{ error }`) para `useActionState`.

### Inventario: nunca se escribe `stock` directamente

`stock` es una tabla derivada. Se modifica **solo** insertando en `movimiento`, y el trigger `fn_aplicar_movimiento` recalcula existencias, convierte cajas ⇄ unidades (`unidades_por_caja` de la variante) y deja el saldo para el kardex. Reglas que ya están en la base y no deben duplicarse en TypeScript:

- Sobregiro imposible (`check (cajas >= 0)`), la transacción falla completa.
- Concurrencia serializada con `select ... for update` sobre la fila de `stock`.
- Traspaso = una transacción con `TRASPASO_SALIDA` + `TRASPASO_ENTRADA`.
- Anulación = movimiento inverso. **Jamás `UPDATE`/`DELETE` sobre `movimiento`.**
- Documentos (importación, venta) van BORRADOR → CONFIRMADA; confirmar genera los movimientos y sella el documento a nivel de base de datos (`fn_confirmar_importacion`, `fn_confirmar_venta`).

### Bitácora — obligatoria, no opcional

Toda tabla operativa nueva declara su trigger en la misma migración:

```sql
create trigger tr_bitacora_<tabla>
  after insert or update or delete on <tabla>
  for each row execute function fn_bitacora();
```

Para acciones que no son cambios de tabla (login, exportar, imprimir) se usa `registrarEnBitacora()` de `lib/auth.ts` o el RPC `registrar_en_bitacora`. La tabla `bitacora` es append-only e inmutable (`fn_bitacora_inmutable`).

### Migraciones

`supabase/migrations/` es la **única fuente de verdad** del esquema; se aplican en orden alfabético, por eso van numeradas (`0001_utilidades` … `0013_superadmin`). Nunca cambiar el esquema desde el panel de Supabase. Tras una migración, regenerar los tipos con `npm run db:types` — `lib/supabase/database.types.ts` es generado, no se edita a mano.

Convenciones del esquema (detalle en [BACKEND.md § 3](BACKEND.md)): `snake_case`, tablas en **singular**, PK `bigint generated always as identity` (nunca el código de negocio), `created_at`/`updated_at` en toda tabla, `activo` para borrado lógico, dinero `numeric(14,4)` (jamás `float`), texto `text`.

### i18n y preferencias

[lib/i18n.ts](lib/i18n.ts) traduce **solo la interfaz fija** (menú, botones comunes, Ajustes) a ES/中文; el contenido de las páginas sigue en español a propósito. Idioma y tema se leen en el servidor (`lib/preferencias.ts`) y se guardan con Server Actions.

## Definición de Terminado

Una historia no está terminada si le falta alguno de estos puntos (ver [PLAN_AVANZE.md](PLAN_AVANZE.md) y [BACKEND.md § Buenas prácticas](BACKEND.md)):

- PR revisado — **nunca push directo a `main`** — con CI verde (format, lint, typecheck, tests, build).
- TypeScript `strict` sin `any`; toda entrada validada con Zod en el borde.
- Migración versionada, reproducible desde cero, con **RLS y política escrita** para cada tabla nueva.
- Trigger de bitácora declarado en cada tabla operativa nueva.
- Tests unitarios de la lógica; de integración si toca stock, incluida concurrencia.
- Documentación actualizada en el **mismo** PR (`BACKEND.md`, `FLUJO.md`, `DESARROLLO.md`, `PLAN_AVANZE.md`).

Commits convencionales (`feat:`, `fix:`, `docs:`, `refactor:`) con descripción en español.

## Datos del cliente

`BODEGA.xls` y cualquier planilla con datos reales **no se versionan** (`.gitignore` excluye `*.xls`). La ruta se pasa por `BODEGA_XLS_PATH`. El parser vive en `lib/bodega/` con sus tests unitarios (zonas en texto libre tipo `1-3 (2)M3(1)`), y `scripts/migrar-bodega.ts` valida totales contra la hoja 汇总 antes de escribir.
