# hongteng-prueba

**Sistema de Gestión e Inventario — HONG TENG LTDA**

Sistema web a medida para una empresa importadora y distribuidora mayorista de calzado y confección, que opera desde la Zona Franca de Iquique (ZOFRI), Chile. Reemplaza el control de bodega llevado en Excel (`BODEGA.xls`) por un sistema centralizado, multiusuario y con trazabilidad completa de movimientos.

## Contexto

Hoy la operación se apoya en dos herramientas desconectadas:

- **Galpón** (IquiqueSoft): software comercial de escritorio para facturación y trámites de zona franca.
- **BODEGA.xls**: planilla Excel mantenida a mano, donde vive el control real del stock físico (~2.500 artículos, ~19.167 cajas en existencia).

El objetivo es unificar esta operación en una única fuente de verdad.

## Alcance Fase 1 (MVP)

| Módulo                  | Entrega                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Maestros / Catálogo     | Productos (SKU, categoría, tallas, pares por caja, descripción bilingüe ES/中文), categorías, zonas, proveedores, clientes                   |
| Usuarios y seguridad    | Login, roles y permisos, y **bitácora**: toda acción de un usuario queda registrada con su id, en una tabla que no se puede editar ni borrar |
| Inventario / Bodega     | Stock por producto y zona en cajas y unidades, movimientos, kardex                                                                           |
| Compras / Importaciones | Registro de importaciones con ingreso automático a stock                                                                                     |
| Migración de datos      | Carga inicial desde `BODEGA.xls`                                                                                                             |
| Reportes básicos        | Existencias por categoría, buscador con ubicación, kardex, exportación a Excel                                                               |

**Fase 2 (fuera de alcance del MVP):** ventas/facturación, documentos de aduana/zona franca, facturación electrónica (SII/DTE), dashboards, código de barras/QR, app móvil.

## Stack tecnológico

- **Frontend/Backend:** Next.js (App Router) + React + TypeScript
- **UI:** Tailwind CSS + shadcn/ui + TanStack Table
- **Base de datos:** Supabase (PostgreSQL) con funciones, triggers y RLS
- **Auth:** Supabase Auth · **Realtime:** Supabase Realtime · **Storage:** Supabase Storage
- **Despliegue:** Vercel + Supabase Cloud · **CI:** GitHub Actions

## Documentación

- [PRD — Requerimientos del producto](PRD_REQUERIMIENTOS.md)
- [TRD — Documento de Requisitos Técnicos](TRD_Documento%20de%20Requisitos%20T%C3%A9cnicos.md)
- [BACKEND — Arquitectura y modelo de datos](BACKEND.md)
- [UI/UX](UI_UX.md)
- [FLUJO — Procesos del sistema](FLUJO.md)
- [PLAN DE AVANCE — Sprints e hitos](PLAN_AVANZE.md)

## ⚠️ Buenas prácticas de desarrollo

**Este proyecto se desarrolla con buenas prácticas desde el primer commit.** El MVP es solo la primera entrega: el sistema quedará operando el inventario real de la empresa, con dinero y mercadería de por medio. No se acepta código "provisional" que después nadie corrige.

Reglas mínimas, detalladas en [BACKEND.md](BACKEND.md#buenas-prácticas-obligatorias):

- **Migraciones versionadas** en `/supabase/migrations`. Nunca cambios de esquema desde el panel de Supabase.
- **RLS habilitado en todas las tablas.** Una tabla sin política es una tabla pública.
- **TypeScript `strict`**, sin `any`. Tipos de la BD generados, no escritos a mano.
- **Validación con Zod** en el borde + `check`/`not null`/FK en la base de datos.
- **Ninguna escritura directa a `main`**: rama por funcionalidad y Pull Request revisado.
- **CI obligatorio**: lint + typecheck + tests. Si el CI falla, no se mergea.
- **Commits convencionales** (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Sin secretos en el repositorio.** Variables de entorno con `.env.example` documentado.
- **Nada se borra**: borrado lógico en maestros, movimientos de inventario append-only.
- **Toda acción se registra en la bitácora** con el id del usuario, mediante triggers en la base de datos. No es opcional ni depende de que el programador lo recuerde.
- **Documentación viva**: si cambia el modelo o un flujo, se actualiza el `.md` en el mismo PR.

## Metodología

Desarrollo con **SCRUM**, sprints de 2 semanas. Fase 1 estimada en 4 sprints (8 semanas): Sprint 0 (setup), Sprint 1 (maestros + seguridad), Sprint 2 (inventario + migración), Sprint 3 (compras + reportes + puesta en marcha).
