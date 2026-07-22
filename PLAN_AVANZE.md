# PLAN DE AVANCE — Sistema de Gestión e Inventario

Plan de trabajo con metodología **SCRUM** (sprints de 2 semanas). La **Fase 1 (MVP)** cubre 4 sprints (8 semanas); las fases siguientes completan la operación de ventas y zona franca.

## Fase 1 — MVP (8 semanas)

| Sprint   | Semanas | Requerimientos                  | Entregable                                                                                            | Estado       |
| -------- | ------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| Sprint 0 | 1–2     | (preparación)                   | Entorno Next.js + Supabase, repositorio, CI/CD, migraciones base, script de importación de BODEGA.xls | ✅ Terminado |
| Sprint 1 | 3–4     | MAE-01 a MAE-06, ADM-01, ADM-02 | Maestros (productos, categorías, zonas, proveedores, clientes) + login, roles (RLS) y auditoría       | 🟡 En curso  |
| Sprint 2 | 5–6     | INV-01 a INV-04, ADM-04         | Inventario: stock por zona (cajas + unidades), movimientos, kardex, triggers y migración del Excel    | ⬜ Pendiente |
| Sprint 3 | 7–8     | COM-01 a COM-03, REP-01, REP-03 | Compras/importaciones con ingreso a stock, reportes básicos, despliegue final y capacitación          | ⬜ Pendiente |

**🏁 Hito: Release 1 — Núcleo de inventario en producción** (reemplaza a BODEGA.xls).

## Fase 2 — Ventas y reportes

| Sprint   | Requerimientos                  | Entregable                                                                 | Estado       |
| -------- | ------------------------------- | -------------------------------------------------------------------------- | ------------ |
| Sprint 4 | VEN-01, VEN-02, VEN-04          | Ventas con descuento automático de stock y listas de precios               | ⬜ Pendiente |
| Sprint 5 | REP-02, REP-04 a REP-06, INV-05 | Estadística mensual, valorización, alertas de stock, exportación Excel/PDF | ⬜ Pendiente |

**🏁 Hito: Release 2 — Ventas y reportes.**

## Fase 3 — Zona franca y valor agregado

| Sprint   | Requerimientos                 | Entregable                                                                                 | Estado       |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------ | ------------ |
| Sprint 6 | VEN-03, ADM-03, INV-06, INV-07 | Documentos de traspaso/Aduanas, correlativos, toma de inventario y traspasos entre bodegas | ⬜ Pendiente |
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

## Registro de avance

| Fecha      | Sprint   | Avance / notas                                                                                                                                                                  |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | —        | Análisis de requerimientos, propuesta técnica y cotización Fase 1 elaborados                                                                                                    |
| 2026-07-20 | —        | Repositorio creado; documentación base (PRD, TRD, BACKEND, FLUJO, UI_UX) redactada                                                                                              |
| 2026-07-20 | Sprint 0 | Modelo de datos derivado del análisis real de BODEGA.xls, COTIZACION.xlsx y Galpón                                                                                              |
| 2026-07-20 | Sprint 0 | Esqueleto Next.js + TS `strict` + Tailwind; ESLint, Prettier, Vitest y CI en GitHub Actions                                                                                     |
| 2026-07-20 | Sprint 0 | Migraciones 0001–0005: utilidades, seguridad (rol/permiso/rol_permiso), catálogo, inventario y RLS                                                                              |
| 2026-07-20 | Sprint 0 | Lector de BODEGA.xls + parser de zonas con 20 pruebas. Diagnóstico: totales cuadran, 0 descuadres, 95 % de zonas parseadas                                                      |
| 2026-07-21 | Sprint 0 | Esquema aplicado al proyecto Supabase: 16 tablas, 31 políticas RLS, bitácora activa. **Sprint 0 cerrado**                                                                       |
| 2026-07-21 | Sprint 1 | Login con Supabase Auth, middleware de sesión, navegación filtrada por permisos, resumen por categoría (REP-01), maestro de categorías (MAE-03) y consulta de bitácora (ADM-02) |

## Hallazgo abierto que requiere decisión del cliente

El diagnóstico sobre la planilla real (`npx tsx scripts/analizar-bodega.ts`) dejó **67 filas** en las que las cantidades anotadas entre paréntesis en la columna 区域 **no suman la existencia** de la fila. Ejemplo real: `1-3 (2)M3(1)` en un artículo con 7 cajas de existencia.

Las anotaciones de zona quedaron desactualizadas respecto de 实存. Antes de migrar hay que decidir con el cliente cuál dato manda:

- **Opción A** — manda 实存: se carga la existencia total y las zonas quedan como referencia a confirmar en la toma de inventario físico.
- **Opción B** — mandan las anotaciones: se carga lo anotado por zona y se ajusta la existencia.
- **Opción C** — se cargan ambas y la diferencia queda marcada para que bodega la resuelva artículo por artículo.

Mientras no se decida, el parser carga lo anotado y marca la fila con `reconcilia: false`. **No se adivina.**
