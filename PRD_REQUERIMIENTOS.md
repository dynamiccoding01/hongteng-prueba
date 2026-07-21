# Documento de Requisitos del Producto (PRD)

**Sistema de Gestión e Inventario** · HONG TENG LTDA (RUT 76.121.992-8)
Empresa importadora y distribuidora mayorista de calzado y confección — Zona Franca de Iquique (ZOFRI), Chile.

## Resumen ejecutivo

La empresa importa productos desde China y los vende a mayoristas. Hoy opera con dos herramientas desconectadas: el software **Galpón** (facturación y trámites de zona franca) y la planilla **BODEGA.xls**, donde se controla realmente el stock físico. El catálogo tiene ≈2.500 artículos gestionados por **cajas** (cada código define pares/piezas por caja), con ≈19.167 cajas en existencia sobre 35.042 ingresadas históricamente.

El sistema propio de gestión e inventario debe unificar esta operación, formalizando el modelo de datos implícito de la planilla: código (货号), pares por caja (双数), rango de tallas (码段), entradas (入库), salidas (出库), existencia (实存) y zona de bodega (区域).

**Problemas a resolver:** doble registro desconectado, mantención manual sin trazabilidad, códigos duplicados (≈33 casos en ropa), datos solo en chino, unidad ambigua (caja vs. pares), ubicaciones como texto libre y ausencia de control de usuarios.

> El análisis detallado de los datos reales de la planilla (zonas compuestas, variantes de empaque, códigos numéricos, formatos de talla) está en [BACKEND.md § Hallazgos](BACKEND.md#2-hallazgos-del-análisis-de-datos-del-cliente).

# REQUERIMIENTOS FUNCIONALES

Prioridad: **Alta** (núcleo) · **Media** (operación completa) · **Baja** (valor agregado).

## Maestros / Catálogo

| Código | Requerimiento                                                                                                                                                                   | Prioridad |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| MAE-01 | Maestro de productos con código (SKU), categoría, descripción bilingüe (ES/中文), rango de tallas y unidad de medida (pares 双数 para calzado, piezas 件数 para ropa)           | Alta      |
| MAE-02 | Variantes por empaque: un mismo código de fábrica puede venir en cajas de distinta cantidad (ej. `LB23020` en cajas de 600 y de 1200 piezas). El stock se controla por variante | Alta      |
| MAE-03 | Maestro de categorías (niño, juvenil, adulto, ropa) ampliable                                                                                                                   | Alta      |
| MAE-04 | Maestro de zonas/ubicaciones de bodega, normalizado                                                                                                                             | Alta      |
| MAE-05 | Maestro de proveedores (China) y de clientes mayoristas                                                                                                                         | Alta      |
| MAE-06 | Maestro de monedas y tipo de cambio (USD, EUR, UF, UTM)                                                                                                                         | Media     |

## Compras / Importaciones

| Código | Requerimiento                                                                                                    | Prioridad |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| COM-01 | Registro de importaciones/compras por proveedor, con documento de aduana (traspaso 203), moneda y tipo de cambio | Alta      |
| COM-02 | Detalle de importación por producto en cajas, con costeo unitario                                                | Alta      |
| COM-03 | Ingreso a stock automático al confirmar la importación (genera movimiento de entrada)                            | Alta      |
| COM-04 | Cálculo de costo de mercadería (idealmente con gastos de internación)                                            | Media     |

## Inventario / Bodega

| Código | Requerimiento                                                                                   | Prioridad |
| ------ | ----------------------------------------------------------------------------------------------- | --------- |
| INV-01 | Existencias por producto y por zona/ubicación, en cajas y en unidades/pares simultáneamente     | Alta      |
| INV-02 | Registro de todo movimiento (entrada, salida, ajuste, traspaso) con fecha, usuario y referencia | Alta      |
| INV-03 | Kardex por producto (historial cronológico de movimientos y saldos)                             | Alta      |
| INV-04 | Conversión automática caja ⇄ unidades usando "pares por caja"                                   | Alta      |
| INV-05 | Alertas de stock crítico / mínimo por producto                                                  | Media     |
| INV-06 | Toma de inventario físico y ajuste por diferencias                                              | Media     |
| INV-07 | Traspasos entre ubicaciones/bodegas (ej. Arica–Iquique)                                         | Media     |
| INV-08 | Etiquetas y lectura por código de barras / QR                                                   | Baja      |

## Ventas / Despachos

| Código | Requerimiento                                                            | Prioridad |
| ------ | ------------------------------------------------------------------------ | --------- |
| VEN-01 | Notas de venta y facturación a clientes mayoristas, en múltiples monedas | Alta      |
| VEN-02 | Venta por caja o por unidades/pares, con descuento de stock automático   | Alta      |
| VEN-03 | Documentos de traspaso de mercancías para Aduanas (formato zona franca)  | Media     |
| VEN-04 | Gestión de precios y listas de precios por cliente/volumen               | Media     |
| VEN-05 | Comisiones de vendedor                                                   | Baja      |

## Reportes / Estadísticas

| Código | Requerimiento                                                         | Prioridad |
| ------ | --------------------------------------------------------------------- | --------- |
| REP-01 | Resumen de existencias por categoría (equivalente a la hoja 汇总)     | Alta      |
| REP-02 | Estadística de salidas por mes y por producto (hojas 统计) y rotación | Alta      |
| REP-03 | Buscador global de artículos con existencia y ubicación               | Alta      |
| REP-04 | Valorización de inventario (a costo)                                  | Media     |
| REP-05 | Reportes de ventas por cliente, producto y período                    | Media     |
| REP-06 | Exportación a Excel/PDF de todos los reportes                         | Media     |

## Administración y seguridad

| Código | Requerimiento                                                                                                                                         | Prioridad |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| ADM-01 | Usuarios, roles y permisos por módulo. Un usuario tiene un rol; cada rol agrupa muchos permisos (relación rol–permiso administrable desde el sistema) | Alta      |
| ADM-02 | Bitácora de auditoría (quién hizo qué y cuándo)                                                                                                       | Alta      |
| ADM-03 | Datos de empresa, correlativos de documentos y respaldos                                                                                              | Media     |
| ADM-04 | Migración inicial de datos desde BODEGA.xls                                                                                                           | Alta      |

# REQUERIMIENTOS NO FUNCIONALES

- **Multiusuario y concurrente** — varias personas operando bodega y ventas a la vez sin descuadrar el stock.
- **Multi-moneda** — manejo de USD, EUR, UF y UTM con tipo de cambio configurable.
- **Soporte bilingüe** — interfaz y datos en español, con descripciones/códigos en chino cuando aplique.
- **Trazabilidad y auditoría** — historial completo de movimientos con usuario, fecha y referencia.
- **Respaldo y seguridad** — copias de seguridad automáticas y control de acceso por rol.
- **Usabilidad** — pensado para operadores de bodega; búsquedas rápidas y carga ágil.
