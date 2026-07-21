# TRD — Documento de Requisitos Técnicos

**Sistema de Gestión e Inventario** · Documento interno del equipo de desarrollo.

> **Calidad no negociable.** Aunque la Fase 1 sea un MVP, el sistema pasará a operar el inventario real de la empresa. Todo el desarrollo sigue las [buenas prácticas obligatorias](BACKEND.md#buenas-prácticas-obligatorias): migraciones versionadas, RLS en todas las tablas, TypeScript `strict`, PR revisado, CI verde y tests sobre la lógica de stock. No se toma deuda técnica "para salir rápido del MVP".

## 1. Objetivo y enfoque

Aplicación web full-stack con **Next.js + TypeScript** (frontend y backend) y **Supabase** (PostgreSQL gestionado) como plataforma de datos, autenticación, almacenamiento y tiempo real.

Criterios de la elección: velocidad de desarrollo con equipo pequeño, TypeScript de punta a punta, modelo relacional que calza con los datos de la planilla, y servicios gestionados (auth, respaldos, realtime) para enfocarse en la lógica de negocio.

## 2. Stack tecnológico

| Capa              | Tecnología                                | Rol                                                  |
| ----------------- | ----------------------------------------- | ---------------------------------------------------- |
| Lenguaje          | TypeScript                                | Un solo lenguaje en front, back y scripts            |
| Frontend          | Next.js (App Router) + React              | UI de bodega/ventas/reportes; SSR/CSR híbrido        |
| UI / Componentes  | Tailwind CSS + shadcn/ui + TanStack Table | Estilos, componentes accesibles, grillas con filtros |
| Backend / API     | Next.js Route Handlers + Server Actions   | Lógica de aplicación; validación con Zod             |
| Base de datos     | Supabase (PostgreSQL)                     | Modelo relacional; funciones y triggers de stock     |
| Autenticación     | Supabase Auth                             | Login, sesiones y roles (ADM-01)                     |
| Autorización      | Row Level Security (RLS)                  | Políticas por rol a nivel de fila, en la BD          |
| Almacenamiento    | Supabase Storage                          | Imágenes de productos y documentos                   |
| Tiempo real       | Supabase Realtime                         | Stock y movimientos en vivo entre usuarios           |
| Reportes / Export | exceljs + @react-pdf/renderer             | Exportación Excel/PDF (REP-06)                       |
| Despliegue        | Vercel + Supabase Cloud                   | CI/CD, entornos dev/staging/prod                     |
| Repositorio / CI  | GitHub + GitHub Actions                   | Versionado, revisión, pruebas automatizadas          |

## 3. Cómo el stack resuelve cada requerimiento clave

| Requerimiento                               | Solución técnica                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| INV-01 / INV-04 (stock en cajas y unidades) | Tabla `stock` con columnas `cajas` y `unidades`; conversión con `producto.pares_por_caja` (columna generada o RPC)    |
| INV-02 / INV-03 (movimientos y kardex)      | Tabla `movimiento` append-only; trigger que actualiza `stock` en cada inserción; kardex = consulta ordenada por fecha |
| Multiusuario / concurrencia (RNF)           | Transacciones PostgreSQL + Realtime; los cambios de stock se serializan en la BD, no en el cliente                    |
| ADM-01 (usuarios, roles, permisos)          | Supabase Auth + tabla de roles; RLS restringe qué ve/edita cada rol                                                   |
| ADM-02 (auditoría)                          | Columnas `created_by`/`created_at`/`updated_at` + bitácora escrita por triggers; nada se borra físicamente            |
| ADM-04 (migración desde Excel)              | Script TypeScript con librería `xlsx` que lee BODEGA.xls y carga productos, stock y zonas                             |
| Multi-moneda (RNF)                          | Tabla de monedas y tipo de cambio; los documentos guardan `moneda` y `tipo_cambio` del día                            |
| Respaldo y seguridad (RNF)                  | Backups automáticos de Supabase (point-in-time) + RLS + HTTPS                                                         |

## 4. Estructura del proyecto y entornos

```
/app                   → rutas y páginas (Next.js App Router)
/components            → componentes UI (shadcn/ui)
/lib                   → cliente Supabase, helpers, validaciones Zod
/supabase/migrations   → esquema SQL, funciones y triggers
/scripts               → migración de BODEGA.xls y utilidades
```

Tres entornos: **desarrollo** (local), **staging** (validación con el cliente) y **producción**, cada uno con su proyecto Supabase y despliegue en Vercel. **Jamás se prueba en producción.**

### Estándares de código

| Área          | Estándar                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Lenguaje      | TypeScript `strict`, sin `any`; tipos de BD generados con `supabase gen types`                                             |
| Validación    | Zod en el borde (formularios y API) + `check`/`not null`/FK en PostgreSQL                                                  |
| Formato       | ESLint + Prettier; el formato no se discute en la revisión                                                                 |
| Ramas         | Rama por funcionalidad + Pull Request revisado. Nunca push directo a `main`                                                |
| Commits       | Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`)                                                      |
| CI            | GitHub Actions: lint + typecheck + tests. Si falla, no se mergea                                                           |
| Tests         | Unitarios de conversión/costeo/precios; integración de stock (entrada, salida, ajuste, traspaso, anulación y concurrencia) |
| Secretos      | Solo en variables de entorno; `.env.example` documentado. La `service_role key` nunca llega al navegador                   |
| Documentación | Si un cambio altera el modelo o un flujo, se actualiza el `.md` en el mismo PR                                             |

## 5. Consideración: conectividad en bodega

Supabase es cloud; el sistema requiere internet en bodega y oficinas. Si la conexión resulta inestable: (a) PWA con caché offline y cola de escritura, o (b) Supabase self-hosted en servidor local. Punto a validar en el relevamiento técnico.

## 6. Metodología: SCRUM (sprints de 2 semanas)

**Roles:** Product Owner (contraparte del cliente), Scrum Master (líder técnico), Equipo de Desarrollo.
**Ceremonias:** Sprint Planning, Daily Scrum (15 min), Sprint Review, Retrospective, Refinement.

### Backlog por sprints y releases

| Sprint   | Historias                                                                | Resultado                                                                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Sprint 0 | Setup Next.js + Supabase, migraciones base, CI/CD, script de importación | Entorno y esqueleto; BODEGA.xls importable                                           |
| Sprint 1 | MAE-01 a MAE-06; ADM-01, ADM-02                                          | Catálogo, categorías, zonas, proveedores, clientes; Auth, roles (RLS) y auditoría    |
| Sprint 2 | INV-01 a INV-04; ADM-04                                                  | Stock por zona (cajas+unidades), movimientos, kardex, triggers y migración           |
| Sprint 3 | COM-01 a COM-04; INV-06, INV-07                                          | Importaciones, costeo, toma física y traspasos → **Release 1: Núcleo de inventario** |
| Sprint 4 | VEN-01, VEN-02, VEN-04                                                   | Ventas con descuento de stock y listas de precios                                    |
| Sprint 5 | REP-01 a REP-06; INV-05                                                  | Reportes, buscador, valorización, alertas, export → **Release 2: Ventas y reportes** |
| Sprint 6 | VEN-03; ADM-03                                                           | Documentos de traspaso/Aduanas y correlativos                                        |
| Sprint 7 | INV-08; dashboards                                                       | Código de barras/QR, tableros → **Release 3: Zona franca y valor agregado**          |

## 7. Próximos pasos técnicos

1. Confirmar conectividad en bodega y decidir cloud vs. self-hosted / PWA offline.
2. Crear el proyecto Supabase y el repositorio; definir esquema inicial y políticas RLS.
3. Escribir el script de migración de BODEGA.xls y resolver códigos duplicados (modelo de variantes).
4. Ejecutar el Sprint 0 y estimar el backlog para arrancar el Sprint 1.
