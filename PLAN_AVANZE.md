# PLAN DE AVANCE — Sistema de Gestión e Inventario

Plan de trabajo con metodología **SCRUM** (sprints de 2 semanas). La **Fase 1 (MVP)** cubre 4 sprints (8 semanas); las fases siguientes completan la operación de ventas y zona franca.

## Fase 1 — MVP (8 semanas)

| Sprint   | Semanas | Requerimientos                  | Entregable                                                                                            | Estado                                                                                     |
| -------- | ------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sprint 0 | 1–2     | (preparación)                   | Entorno Next.js + Supabase, repositorio, CI/CD, migraciones base, script de importación de BODEGA.xls | ✅ Terminado                                                                               |
| Sprint 1 | 3–4     | MAE-01 a MAE-06, ADM-01, ADM-02 | Maestros (productos, categorías, zonas, proveedores, clientes) + login, roles (RLS) y auditoría       | ✅ Terminado                                                                               |
| Sprint 2 | 5–6     | INV-01 a INV-04, ADM-04         | Inventario: stock por zona (cajas + unidades), movimientos, kardex, triggers y migración del Excel    | ✅ Terminado                                                                               |
| Sprint 3 | 7–8     | COM-01 a COM-03, REP-01, REP-03 | Compras/importaciones con ingreso a stock, reportes básicos, despliegue final y capacitación          | 🟡 Desarrollo listo; faltan despliegue y capacitación (pospuestos por decisión del equipo) |

**🏁 Hito: Release 1 — Núcleo de inventario en producción** (reemplaza a BODEGA.xls).

## Fase 2 — Ventas y reportes

| Sprint   | Requerimientos                  | Entregable                                                                 | Estado       |
| -------- | ------------------------------- | -------------------------------------------------------------------------- | ------------ |
| Sprint 4 | VEN-01, VEN-02, VEN-04          | Ventas con descuento automático de stock y listas de precios               | ✅ Terminado |
| Sprint 5 | REP-02, REP-04 a REP-06, INV-05 | Estadística mensual, valorización, alertas de stock, exportación Excel/PDF | ✅ Terminado |

**🏁 Hito: Release 2 — Ventas y reportes.**

## Fase 3 — Zona franca y valor agregado

| Sprint   | Requerimientos                 | Entregable                                                                                 | Estado       |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------ | ------------ |
| Sprint 6 | VEN-03, ADM-03, INV-06, INV-07 | Documentos de traspaso/Aduanas, correlativos, toma de inventario y traspasos entre bodegas | ✅ Terminado |
| Sprint 7 | INV-08, VEN-05                 | Código de barras/QR, comisiones, dashboards y afinamientos                                 | ⬜ Pendiente |

**🏁 Hito: Release 3 — Zona franca y valor agregado.**

## Ceremonias por sprint

| Ceremonia       | Cuándo            | Objetivo                                           |
| --------------- | ----------------- | -------------------------------------------------- |
| Sprint Planning | Inicio de sprint  | Seleccionar y estimar historias del Sprint Backlog |
| Daily Scrum     | Diario (15 min)   | Sincronizar avance e impedimentos                  |
| Sprint Review   | Fin de sprint     | Demo del incremento al cliente y feedback          |
| Retrospective   | Fin de sprint     | Mejorar el proceso del equipo                      |
| Refinement      | Durante el sprint | Detallar y estimar historias futuras               |

## Criterios de avance (Definición de Terminado)

Una historia **no está terminada** si no cumple todos estos puntos. No se negocian por presión de plazo:

- [ ] Código revisado en Pull Request (nunca push directo a `main`) y CI verde: lint + typecheck + tests.
- [ ] TypeScript `strict` sin `any`; entradas validadas con Zod.
- [ ] Migraciones SQL versionadas en `/supabase/migrations`, reproducibles desde cero.
- [ ] RLS habilitado y política escrita para cada tabla nueva.
- [ ] **Trigger de bitácora declarado** en cada tabla operativa nueva (`fn_bitacora()`), y las acciones de aplicación registradas con `registrar_en_bitacora()`.
- [ ] Tests: unitarios de la lógica y de integración si toca stock (incluida concurrencia).
- [ ] Sin descuadres de stock: el kardex concilia con las existencias.
- [ ] Documentación actualizada en el mismo PR ([BACKEND.md](BACKEND.md), [FLUJO.md](FLUJO.md)).
- [ ] Desplegado en **staging** y validado en la demo de Sprint Review.

> Ver [buenas prácticas obligatorias](BACKEND.md#buenas-prácticas-obligatorias). Este sistema va a operar el inventario real de la empresa: la deuda técnica que se tome ahora se paga con descuadres de mercadería después.

## Pendientes previos al Sprint 0

- [ ] Validar el análisis y priorización del backlog con el cliente.
- [ ] Designar al Product Owner (contraparte del cliente).
- [ ] Confirmar datos fiscales de la empresa (razón social, RUT definitivo).
- [ ] Confirmar conectividad a internet en bodega (decide cloud vs. PWA offline / self-hosted).
- [ ] Validar con el cliente el parser de **zonas compuestas** (`1-3 (2)M3(1)`): 179 de 242 valores de 区域 tienen este formato.
- [ ] Confirmar la clasificación de códigos repetidos: variante de empaque vs. duplicado de digitación (ver [BACKEND.md](BACKEND.md#2-hallazgos-del-análisis-de-datos-del-cliente)).
- [ ] Definir si el sistema se integra con Galpón o lo reemplaza.

## Checklist Sprint 1 (detalle de trabajo)

Auditoría del código realizada el 2026-07-22. Se tacha cada tarea al completarla.

- [x] ~~Login con Supabase Auth y middleware de sesión~~
- [x] ~~Navegación filtrada por permisos~~
- [x] ~~MAE-01/02 — Maestro de productos y variantes de empaque~~ (`app/(app)/maestros/productos`)
- [x] ~~MAE-03 — Maestro de categorías~~ (`app/(app)/maestros/categorias`)
- [x] ~~MAE-04 — Bodegas y zonas~~ (`app/(app)/maestros/zonas`)
- [x] ~~MAE-05 — Maestro de proveedores~~ (`app/(app)/maestros/proveedores`)
- [x] ~~ADM-01 — Usuarios y asignación de rol~~ (`app/(app)/admin/usuarios`, `admin/roles`)
- [x] ~~ADM-02 — Consulta de bitácora~~ (`app/(app)/bitacora`)
- [x] ~~MAE-06 — Maestro de clientes: migración `0007_clientes.sql` (tabla + RLS + trigger de bitácora + permisos `cliente.ver`/`cliente.editar`)~~
- [x] ~~MAE-06 — Tipos de base de datos regenerados (`lib/supabase/database.types.ts`)~~
- [x] ~~MAE-06 — Página `app/(app)/maestros/clientes` con acciones validadas con Zod~~
- [x] ~~MAE-06 — Entrada «Clientes» en la navegación~~
- [x] ~~MAE-06 — Migración aplicada al proyecto Supabase~~ (aplicada + seed el 2026-07-22)
- [x] ~~Verificación completa: lint + typecheck + tests + build en verde~~ (validado por el CI en el commit 4f47958)
- [x] ~~Pull Request `feat/sprint-1-clientes → main` creado en GitHub y CI en verde~~ (PR #1, CI verde el 2026-07-22)
- [x] ~~Pull Request revisado y mergeado a `main`~~ (PR #1 mergeado el 2026-07-22 — **Sprint 1 cerrado**)

## Checklist Sprint 2 (detalle de trabajo)

La capa de base de datos (tablas `stock` y `movimiento`, triggers de conversión caja⇄unidades,
`fn_traspasar`, `fn_anular_movimiento` y vistas) quedó lista en Sprint 0; este sprint construye
la interfaz y ejecuta la migración de datos.

- [x] ~~INV-01 — Vista «Stock por zona»: existencias por artículo × zona en cajas y unidades~~ (`app/(app)/inventario/stock`)
- [x] ~~INV-02 — Página «Movimientos»: registrar entradas, salidas y ajustes (motivo obligatorio en ajustes) y anular con movimiento inverso~~ (`app/(app)/inventario/movimientos`)
- [x] ~~INV-03 — Kardex por artículo (historial cronológico con saldos)~~ (`app/(app)/inventario/kardex`)
- [x] ~~ADM-04 — Migración de BODEGA.xls: script completo con la **opción A** (manda 实存)~~ (`scripts/migrar-bodega.ts` + `lib/bodega/planificar-migracion.ts`; simulación por defecto, `--ejecutar` para la carga real, barrera anti-doble-corrida y conciliación final. La corrida real queda para cuando el cliente entregue el archivo — no está en el equipo)
- [x] ~~Tests de integración de stock (incluida concurrencia) según la Definición de Terminado~~ (`lib/inventario/stock.integracion.test.ts`, 8 tests contra la base real)
- [x] ~~PR del Sprint 2 con CI verde y merge a `main`~~ (PR #2 mergeado el 2026-07-22; solo queda ADM-04 esperando al cliente)

## Checklist Sprint 3 (detalle de trabajo)

REP-01 (resumen por categoría) y REP-03 (buscador con existencia y ubicación) ya quedaron
implementados en Sprint 1; este sprint se centra en compras/importaciones.

- [x] ~~COM-01/02 — Migración `0008_compras.sql`: tablas `importacion` e `importacion_detalle` con RLS, bitácora y estados BORRADOR → CONFIRMADA~~ (aplicada a Supabase el 2026-07-22; tipos regenerados)
- [x] ~~COM-03 — `fn_confirmar_importacion`: genera los movimientos de ENTRADA (documento IMPORTACION) y sella la importación (confirmada no se edita, a nivel de base de datos)~~
- [x] ~~Página «Importaciones»: crear borrador, agregar detalle, confirmar~~ (`app/(app)/compras/importaciones` + sección «Compras» en la navegación)
- [x] ~~Tests de integración de la confirmación~~ (5 tests: permiso exigido, ingreso a stock con conversión, doble confirmación bloqueada, detalle y cabecera inmutables)
- [x] ~~PR del Sprint 3 con CI verde y merge a `main`~~ (PR #4 mergeado el 2026-07-22)

## Checklist Sprint 4 (detalle de trabajo)

Ventas con el mismo patrón probado de compras: documento BORRADOR → CONFIRMADA sellado por la
base de datos, y el stock solo se toca vía movimientos.

- [x] ~~Migración `0009_ventas.sql`: permisos `venta.*`/`precio.editar`, listas de precios (VEN-04), `venta` + `venta_detalle` (VEN-01/02), `fn_confirmar_venta` (SALIDAS automáticas), RLS y bitácora~~ (aplicada a Supabase el 2026-07-22; tipos regenerados)
- [x] ~~Página «Listas de precios» (VEN-04): crear lista por moneda, fijar precios por artículo y asignar lista al cliente~~ (`app/(app)/ventas/precios`)
- [x] ~~Página «Notas de venta» (VEN-01/02): borrador por cliente, detalle con precio sugerido desde la lista del cliente, confirmar descuenta stock~~ (`app/(app)/ventas/notas` + sección «Ventas» en la navegación)
- [x] ~~Tests de integración: la venta descuenta stock, el sobregiro falla completo (todo o nada), la doble confirmación y la edición post-confirmación se bloquean~~ (5 tests)
- [x] ~~PR del Sprint 4 con CI verde y merge a `main`~~ (PR #5 mergeado el 2026-07-22 — **Sprint 4 cerrado**)

## Checklist Sprint 5 (detalle de trabajo)

- [x] ~~Migración `0010_reportes.sql`: vistas `v_salidas_mensuales` (REP-02), `v_valorizacion` (REP-04), `v_ventas_detalle` (REP-05) y `v_alertas_stock` (INV-05), todas con `security_invoker`~~ (aplicada el 2026-07-22)
- [x] ~~Página «Estadística mensual» (REP-02): salidas por mes y detalle por producto~~ (`app/(app)/reportes/estadistica`)
- [x] ~~Página «Valorización» (REP-04): stock a último costo de importación en CLP, con total y aviso de artículos sin costo~~ (`app/(app)/reportes/valorizacion`)
- [x] ~~Página «Ventas por período» (REP-05): por cliente y producto con rango de fechas~~ (`app/(app)/reportes/ventas`)
- [x] ~~Alertas de stock mínimo (INV-05): página con artículos en o bajo mínimo y definición del mínimo por variante~~ (`app/(app)/inventario/alertas`)
- [x] ~~Exportación a Excel (REP-06): descarga .xlsx de los tres reportes, con permiso `reporte.exportar` y rastro EXPORTAR en bitácora~~ (`app/api/exportar`)
- [x] ~~Tests de integración de las vistas de reportes~~ (4 tests: salidas del mes, valorización a CLP, monto de venta, alerta bajo mínimo)
- [x] ~~PR del Sprint 5 con CI verde y merge a `main`~~ (PR #6 mergeado el 2026-07-22 — **Sprint 5 cerrado, Release 2 completa en desarrollo**)

## Checklist Sprint 6 (detalle de trabajo)

- [x] ~~Migración `0011_zona_franca.sql`: datos de empresa + correlativos con `fn_siguiente_correlativo` (ADM-03), `documento_traspaso` numerado desde venta confirmada (VEN-03), `toma_inventario` + `fn_aplicar_toma_inventario` con ajustes por diferencia (INV-06), y permiso reforzado en `fn_traspasar` (INV-07)~~ (aplicada el 2026-07-22; tipos regenerados)
- [x] ~~Página «Traspasos» (INV-07): mover cajas entre zonas/bodegas con motivo~~ (`app/(app)/inventario/traspasos`)
- [x] ~~Página «Toma de inventario» (INV-06): conteo por zona en borrador, comparación contra el sistema, y aplicación de diferencias como ajustes~~ (`app/(app)/inventario/toma`)
- [x] ~~Página «Traspasos ante Aduanas» (VEN-03): emitir documento 203 numerado desde una venta confirmada, y anularlo~~ (`app/(app)/ventas/traspasos-aduana`)
- [x] ~~Página «Empresa» (ADM-03): datos fiscales editables, con aviso mientras el RUT no esté confirmado por el cliente~~ (`app/(app)/admin/empresa`)
- [x] ~~Tests de integración: correlativo secuencial, permiso en `fn_traspasar`, toma con ajuste de solo la diferencia, emisión/anulación del documento~~ (8 tests nuevos; se corrigió también `fn_traspasar` en el test del Sprint 2, que quedó exigiendo el permiso nuevo)
- [ ] PR del Sprint 6 con CI verde y merge a `main`

## Registro de avance

| Fecha      | Sprint   | Avance / notas                                                                                                                                                                                                                                                                           |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | —        | Análisis de requerimientos, propuesta técnica y cotización Fase 1 elaborados                                                                                                                                                                                                             |
| 2026-07-20 | —        | Repositorio creado; documentación base (PRD, TRD, BACKEND, FLUJO, UI_UX) redactada                                                                                                                                                                                                       |
| 2026-07-20 | Sprint 0 | Modelo de datos derivado del análisis real de BODEGA.xls, COTIZACION.xlsx y Galpón                                                                                                                                                                                                       |
| 2026-07-20 | Sprint 0 | Esqueleto Next.js + TS `strict` + Tailwind; ESLint, Prettier, Vitest y CI en GitHub Actions                                                                                                                                                                                              |
| 2026-07-20 | Sprint 0 | Migraciones 0001–0005: utilidades, seguridad (rol/permiso/rol_permiso), catálogo, inventario y RLS                                                                                                                                                                                       |
| 2026-07-20 | Sprint 0 | Lector de BODEGA.xls + parser de zonas con 20 pruebas. Diagnóstico: totales cuadran, 0 descuadres, 95 % de zonas parseadas                                                                                                                                                               |
| 2026-07-21 | Sprint 0 | Esquema aplicado al proyecto Supabase: 16 tablas, 31 políticas RLS, bitácora activa. **Sprint 0 cerrado**                                                                                                                                                                                |
| 2026-07-21 | Sprint 1 | Login con Supabase Auth, middleware de sesión, navegación filtrada por permisos, resumen por categoría (REP-01), maestro de categorías (MAE-03) y consulta de bitácora (ADM-02)                                                                                                          |
| 2026-07-22 | Sprint 1 | Maestro de clientes (MAE-06): migración 0007 (tabla + RLS + bitácora + permisos), aplicada a Supabase con seed, tipos regenerados, página con CRUD validado con Zod y entrada en la navegación                                                                                           |
| 2026-07-22 | Sprint 1 | MAE-06 verificado en la UI por el equipo (pendiente ajuste visual, se hará más adelante). Rama `feat/sprint-1-clientes` subida a GitHub (commit 4e14d9b). Acceso de colaborador otorgado a Armand0777                                                                                    |
| 2026-07-22 | Sprint 1 | PR #1 creado. Primer CI falló por formato (database.types.ts sin pasar por prettier); corregido en 4f47958 y CI en verde: lint + typecheck + tests + build. Pendiente solo el merge a `main`                                                                                             |
| 2026-07-22 | Sprint 1 | PR #1 mergeado a `main`. **Sprint 1 cerrado.** Arranca Sprint 2 — Inventario: INV-01 a INV-04 (stock por zona, movimientos, kardex) y ADM-04 (migración de BODEGA.xls)                                                                                                                   |
| 2026-07-22 | Sprint 2 | Rama `feat/sprint-2-inventario`. Vista «Stock por zona» (INV-01) verificada por el equipo. Página «Movimientos» (INV-02): alta de entradas/salidas/ajustes y anulación por movimiento inverso                                                                                            |
| 2026-07-22 | Sprint 2 | Kardex por artículo (INV-03): búsqueda por código, selector de empaque si hay varios, historial cronológico con saldo por zona y existencia actual en el encabezado                                                                                                                      |
| 2026-07-22 | Sprint 2 | Tests de integración contra la base real (8): conversión caja⇄unidades, sobregiro bloqueado, kardex append-only, concurrencia, traspaso, anulación y conciliación kardex⇄stock. Se omiten sin .env.local                                                                                 |
| 2026-07-22 | Sprint 2 | GitHub CLI instalado y autenticado: push, PR y merge ahora los ejecuta Claude directamente. PR #2 (INV-01 a INV-03 + tests) mergeado a `main` con CI verde. Sprint 2 solo espera ADM-04 (decisión del cliente)                                                                           |
| 2026-07-22 | Sprint 2 | Cliente decide **opción A** (manda 实存). Script de migración ADM-04 completo con simulación, barrera anti-doble-corrida, lotes y conciliación final; probado con planilla sintética + 8 tests del planificador. **Sprint 2 cerrado** — la corrida real espera el BODEGA.xls del cliente |
| 2026-07-22 | Sprint 3 | Rama `feat/sprint-3-compras`. Migración 0008 (importación + detalle, estados, `fn_confirmar_importacion`), página «Importaciones» con flujo borrador → confirmar, y 5 tests de integración. REP-01 y REP-03 ya existían de Sprint 1                                                      |
| 2026-07-22 | Sprint 4 | Rama `feat/sprint-4-ventas`. Migración 0009 (listas de precios, venta + detalle, `fn_confirmar_venta`), páginas «Notas de venta» y «Listas de precios», precio sugerido desde la lista del cliente, y 5 tests de integración (incluido sobregiro todo-o-nada)                            |
| 2026-07-22 | Sprint 5 | Rama `feat/sprint-5-reportes`. Migración 0010 (4 vistas de reportes), páginas Estadística mensual, Valorización, Ventas por período y Alertas de stock, exportación a Excel con bitácora, y 4 tests de integración                                                                       |
| 2026-07-23 | Sprint 6 | Rama `feat/sprint-6-zona-franca`. Migración 0011: empresa + correlativos (ADM-03), toma de inventario con ajuste automático de diferencias (INV-06), documento de traspaso 203 numerado desde venta confirmada (VEN-03), y `fn_traspasar` reforzada con permiso (INV-07)                 |
| 2026-07-23 | Sprint 6 | Páginas Empresa, Traspasos, Toma de inventario y Traspasos ante Aduanas. 8 tests de integración nuevos; se corrigió el test de traspaso del Sprint 2 para autenticarse (dejó de pasar al exigirse el permiso). `vitest.config.ts`: tests de integración en serie (evita 429 de la API)   |

## Hallazgo abierto que requiere decisión del cliente

El diagnóstico sobre la planilla real (`npx tsx scripts/analizar-bodega.ts`) dejó **67 filas** en las que las cantidades anotadas entre paréntesis en la columna 区域 **no suman la existencia** de la fila. Ejemplo real: `1-3 (2)M3(1)` en un artículo con 7 cajas de existencia.

Las anotaciones de zona quedaron desactualizadas respecto de 实存. Antes de migrar hay que decidir con el cliente cuál dato manda:

- **Opción A** — manda 实存: se carga la existencia total y las zonas quedan como referencia a confirmar en la toma de inventario físico.
- **Opción B** — mandan las anotaciones: se carga lo anotado por zona y se ajusta la existencia.
- **Opción C** — se cargan ambas y la diferencia queda marcada para que bodega la resuelva artículo por artículo.

Mientras no se decida, el parser carga lo anotado y marca la fila con `reconcilia: false`. **No se adivina.**
