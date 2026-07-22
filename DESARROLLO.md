# Guía de desarrollo

## Requisitos

- Node.js ≥ 20.9
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para la base de datos local)
- Docker Desktop (lo usa `supabase start`)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completar con las claves del proyecto Supabase

supabase start                 # levanta PostgreSQL + Auth locales
supabase db reset              # aplica supabase/migrations en orden + seed.sql

npm run dev                    # http://localhost:3001
```

> El proyecto usa el puerto **3001** porque el 3000 suele estar tomado por otras
> aplicaciones. Para levantarlo en otro puerto puntualmente:
> `npm run dev -- -p 4000`

## Comandos

| Comando             | Qué hace                                                   |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                                     |
| `npm run build`     | Build de producción (falla si hay errores de tipos o lint) |
| `npm run lint`      | ESLint                                                     |
| `npm run typecheck` | `tsc --noEmit`                                             |
| `npm run format`    | Prettier sobre todo el repositorio                         |
| `npm test`          | Pruebas con Vitest                                         |
| `npm run db:migrar` | Aplica las migraciones pendientes al proyecto en la nube   |
| `npm run db:probar` | Verifica la conexión y qué tablas existen                  |
| `npm run db:types`  | Regenera `lib/supabase/database.types.ts` desde el esquema |
| `npm run db:sql`    | Genera el SQL consolidado para el editor del panel         |

Scripts adicionales (`npx tsx scripts/<archivo>`):

| Script                 | Qué hace                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `verificar-esquema.ts` | Comprueba que triggers, RLS, bitácora y reglas de stock funcionan |
| `asignar-rol.ts`       | Lista usuarios y roles, o asigna un rol a un usuario              |
| `analizar-bodega.ts`   | Diagnóstico de `BODEGA.xls` sin escribir en la base               |

## Estructura

```
app/                    rutas y páginas (Next.js App Router)
components/             componentes de interfaz
lib/
  env.ts                variables de entorno validadas con Zod
  supabase/             clientes de navegador y de servidor
  bodega/               lectura y parseo de BODEGA.xls (con sus tests)
scripts/                utilidades de línea de comandos
supabase/migrations/    esquema SQL versionado — única fuente de verdad
supabase/seed.sql       roles, permisos, categorías y monedas base
```

## Aplicar el esquema sin el CLI de Supabase

Si no tienes Supabase CLI ni Docker instalados, se puede aplicar el esquema al proyecto en la nube desde el editor SQL del panel:

```bash
npm run db:sql        # genera supabase/_aplicar-en-editor-sql.sql
npm run db:probar     # verifica la conexion y que tablas existen
```

1. Abrir el proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Pegar el contenido completo de `supabase/_aplicar-en-editor-sql.sql` y ejecutar.
3. Volver a correr `npm run db:probar`: debe reportar 16/16 tablas.

El archivo generado envuelve todo en `begin; … commit;`, así que si algo falla no queda el esquema a medias. Es un archivo **derivado**: no se versiona ni se edita a mano.

> Esta vía es un puente. En cuanto haya CLI instalado, el flujo correcto es `supabase link` + `supabase db push`, que además lleva el registro de qué migraciones se aplicaron.

## Crear el primer usuario

Los usuarios se crean **desde el panel de Supabase**, no desde un script: las contraseñas las maneja el dueño de la cuenta.

1. Panel de Supabase → **Authentication → Users → Add user**.
2. Correo y contraseña; marcar **Auto Confirm User** para saltar la verificación por email.
3. El trigger `tr_auth_user_creado` le crea el perfil con el rol **Consulta** (solo lectura).
4. Promoverlo:

```bash
npx tsx scripts/asignar-rol.ts                          # lista usuarios y roles
npx tsx scripts/asignar-rol.ts correo@ejemplo.com Administrador
```

## Bitácora: obligatoria en cada tabla nueva

Al crear una tabla operativa, **hay que declarar su trigger de bitácora**. Es parte de la Definición de Terminado:

```sql
create trigger tr_bitacora_<tabla>
  after insert or update or delete on <tabla>
  for each row execute function fn_bitacora();

-- Si la tabla tiene clave compuesta, se indican las columnas que identifican la fila:
create trigger tr_bitacora_rol_permiso
  after insert or update or delete on rol_permiso
  for each row execute function fn_bitacora('rol_id', 'permiso_id');
```

Para acciones que no son cambios de tabla (login, exportar, imprimir):

```ts
await supabase.rpc('registrar_en_bitacora', {
  p_accion: 'EXPORTAR',
  p_modulo: 'reportes',
  p_descripcion: 'Resumen por categoría a Excel',
});
```

## Base de datos

El esquema **solo** se modifica con migraciones. Nunca desde el panel de Supabase.

```bash
supabase migration new descripcion_del_cambio   # crea el archivo
# ... escribir el SQL ...
supabase db reset                               # verificar que corre desde cero
npm run db:types                                # regenerar tipos
```

Las migraciones se aplican en orden alfabético; por eso van numeradas:

| Archivo               | Contenido                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `0001_utilidades.sql` | `fn_set_updated_at`, `fn_bitacora`, `fn_bitacora_inmutable`                                          |
| `0002_seguridad.sql`  | `rol`, `permiso`, `rol_permiso`, `usuario`, `bitacora`, `tiene_permiso()`, `registrar_en_bitacora()` |
| `0003_catalogo.sql`   | monedas, categorías, proveedores, bodegas, zonas, productos y variantes                              |
| `0004_inventario.sql` | `stock`, `movimiento`, triggers de stock, traspaso, anulación y vistas                               |
| `0005_rls.sql`        | RLS y políticas de todas las tablas                                                                  |

## Migración de BODEGA.xls

Antes de cargar nada, ejecutar el diagnóstico. **No escribe en la base de datos:**

```bash
npx tsx scripts/analizar-bodega.ts "ruta/al/BODEGA.xls"
```

Valida los totales contra la hoja 汇总, verifica la regla 实存 = 入库 − 出库 y reporta
qué filas necesitan revisión humana. Estado con la planilla entregada el 2026-07-20:

```
TOTAL filas: 2524
Totales por categoría: los 4 cuadran exactamente con la hoja 汇总
Filas con 实存 != 入库 - 出库: 0
Zonas parseadas automáticamente: 2399/2524 (95,0 %)
Filas parseadas con anotaciones desactualizadas: 67
Filas que requieren revisión humana: 125
  · 89 con la zona vacía en la planilla
  · 28 con códigos pegados sin separador ('1-63-6(1)')
  ·  8 con dos zonas y ninguna cantidad ('1-3 1-8')
```

Las planillas con datos del cliente **no se versionan** (`.gitignore` excluye `*.xls`).

## Antes de abrir un Pull Request

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build
```

Es exactamente lo que corre el CI. Ver la [Definición de Terminado](PLAN_AVANZE.md#criterios-de-avance-definición-de-terminado).
