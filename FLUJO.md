# FLUJO — Procesos del sistema

Flujos operativos del Sistema de Gestión e Inventario, derivados de la operación actual (Galpón + BODEGA.xls) y de los requerimientos del [PRD](PRD_REQUERIMIENTOS.md).

## 1. Flujo general de la operación

```mermaid
flowchart LR
    PROV["Proveedor<br/>(China)"] -->|Importación| ADU["Aduana / ZOFRI<br/>(traspaso 203)"]
    ADU -->|Ingreso| BOD["Bodega<br/>(stock por zonas)"]
    BOD -->|Despacho| CLI["Cliente mayorista"]
    BOD -.->|Movimientos| KAR["Kardex<br/>(trazabilidad)"]
```

## 2. Flujo de compras / importaciones (COM-01 a COM-04)

```mermaid
flowchart TD
    A["Registrar importación<br/>proveedor, doc. aduana 203,<br/>moneda y tipo de cambio"] --> B["Cargar detalle por producto<br/>cajas + costo unitario"]
    B --> C{"¿Confirmar<br/>importación?"}
    C -->|Sí| D["Se generan movimientos<br/>de ENTRADA automáticos"]
    D --> E["Trigger actualiza stock<br/>(cajas y unidades por zona)"]
    E --> F["Kardex registra entrada<br/>con usuario, fecha y referencia"]
    C -->|No| G["Queda en borrador<br/>sin afectar stock"]
```

## 3. Flujo de inventario / bodega (INV-01 a INV-07)

**Movimiento de stock** (entrada, salida, ajuste o traspaso):

```mermaid
flowchart TD
    M["Usuario registra movimiento"] --> V["Validación Zod<br/>producto, zona, cantidad"]
    V --> T["Inserción en tabla movimiento<br/>(append-only)"]
    T --> TR["Trigger PostgreSQL<br/>actualiza stock"]
    TR --> CV["Conversión automática<br/>caja ⇄ unidades (pares_por_caja)"]
    TR --> RT["Supabase Realtime<br/>notifica a los demás usuarios"]
    TR --> AU["Bitácora: usuario_id,<br/>qué y cuándo"]
```

**Reglas:**

- Existencia = entradas − salidas (regla heredada de BODEGA.xls: 实存 = 入库 − 出库).
- Todo movimiento queda en el kardex; nada se edita ni borra físicamente.
- Traspasos entre zonas/bodegas (ej. Arica–Iquique) generan salida en origen y entrada en destino.
- Toma de inventario físico → diferencias se registran como movimientos de AJUSTE.

## 4. Flujo de ventas / despachos (VEN-01 a VEN-03 · Fase 2)

```mermaid
flowchart TD
    NV["Nota de venta<br/>cliente mayorista, moneda"] --> DET["Detalle: producto,<br/>cajas o unidades, precio"]
    DET --> ST{"¿Stock<br/>suficiente?"}
    ST -->|Sí| CONF["Confirmar venta"]
    ST -->|No| ALERT["Alerta: existencia insuficiente"]
    CONF --> SAL["Movimiento de SALIDA<br/>descuento automático de stock"]
    SAL --> DOC["Documentos: factura /<br/>traspaso Aduanas (zona franca)"]
```

## 5. Flujo de migración inicial (ADM-04)

```mermaid
flowchart TD
    XLS["BODEGA.xls · 13 hojas<br/>2.528 filas de producto"] --> LEER["Leer detectando columnas<br/>POR ENCABEZADO (las posiciones<br/>difieren entre hojas)"]
    LEER --> TOT["Descartar fila de totales<br/>入库总数 / 实存总数"]
    TOT --> NORM["Normalizar códigos:<br/>trim, a texto ('80013.0' → '80013')"]
    NORM --> ZON["Parsear zonas compuestas<br/>'1-3 (2)M3(1)' → 2 cajas en 1-3<br/>+ 1 caja en M3"]
    ZON --> DUP{"Código repetido"}
    DUP -->|"mismo empaque,<br/>distinta zona"| S1["Stock en dos zonas<br/>(no es duplicado)"]
    DUP -->|"distinto<br/>unidades_por_caja"| S2["producto_variante"]
    DUP -->|"filas idénticas"| S3["Duplicado de digitación:<br/>consolidar con registro"]
    S1 & S2 & S3 --> DB[("Supabase: producto, variante,<br/>zona, stock, movimiento MIGRACION")]
    DB --> VALID{"¿Cuadra con la hoja 汇总?<br/>35.042 ingresadas / 19.167 existencia"}
    VALID -->|Sí| OK["Migración confirmada"]
    VALID -->|No| RB["ROLLBACK + reporte<br/>de excepciones"]
```

Lo que no se pueda parsear va a un **reporte de excepciones** para revisión manual: nunca se adivina un dato de inventario.

## 6. Flujo de la bitácora (ADM-02)

**Toda acción que hace un usuario se registra en la tabla `bitacora`, con su `usuario_id`.** No depende de que el programador se acuerde de escribirlo: lo hacen triggers en la base de datos, así que no hay forma de modificar un dato sin dejar rastro.

```mermaid
flowchart TD
    U["Usuario autenticado"] --> ACC{"Tipo de acción"}

    ACC -->|"Cambia datos:<br/>alta, edición, baja"| TR["Trigger fn_bitacora()<br/>en la tabla afectada"]
    ACC -->|"Login, exportar,<br/>imprimir, anular"| RPC["registrar_en_bitacora()<br/>llamada desde la app"]

    TR --> CAP["Captura:<br/>auth.uid() → usuario_id<br/>datos_antes / datos_despues<br/>campos_modificados"]
    RPC --> CAP

    CAP --> BIT[("bitacora")]
    BIT --> RO["Append-only: triggers rechazan<br/>UPDATE y DELETE"]
    BIT --> VIS{"¿Quién puede verla?"}
    VIS -->|Su propia actividad| TODOS["Cualquier usuario"]
    VIS -->|La de todos| PERM["Solo con permiso bitacora.ver"]
```

**Qué guarda cada registro:**

| Dato        | Columna                                                                |
| ----------- | ---------------------------------------------------------------------- |
| Quién       | `usuario_id` (FK a `usuario`) + `usuario_email` congelado              |
| Cuándo      | `created_at`                                                           |
| Qué acción  | `accion`: `INSERT`, `UPDATE`, `DELETE`, `LOGIN`, `EXPORTAR`, `ANULAR`… |
| Sobre qué   | `tabla` + `registro_id`                                                |
| Qué cambió  | `datos_antes`, `datos_despues` y `campos_modificados`                  |
| Desde dónde | `ip`, `user_agent`                                                     |

**Tablas cubiertas:** las 14 tablas operativas (`rol`, `permiso`, `rol_permiso`, `usuario`, `moneda`, `tipo_cambio`, `categoria`, `proveedor`, `bodega`, `zona`, `ubicacion_zeta`, `producto`, `producto_variante`, `movimiento`). `stock` queda fuera a propósito: ningún usuario la escribe, la deriva el trigger del movimiento.

**Si un usuario se da de baja**, su bitácora permanece: el email queda congelado en cada registro, así que el rastro sobrevive.

## 7. Flujo de usuario y seguridad (ADM-01, ADM-02)

Cada **usuario** tiene un **rol**, y ese rol acumula **muchos permisos** a través de la tabla intermedia `rol_permiso`. Los permisos no se asignan al usuario directamente: se administran a nivel de rol.

```mermaid
flowchart LR
    LOGIN["Login<br/>(Supabase Auth)"] --> USR["usuario"]
    USR -->|tiene un| ROL["rol<br/>(Administrador, Bodeguero, Ventas)"]
    ROL -->|rol_permiso| PER["permiso<br/>(producto.crear, movimiento.anular…)"]
    PER --> FN["función tiene_permiso()"]
    FN --> RLS["RLS: la BD autoriza<br/>cada operación a nivel de fila"]
    FN --> UI["La interfaz oculta/deshabilita<br/>lo que el rol no puede hacer"]
    RLS --> BIT["Toda operación queda<br/>registrada en bitacora"]
```

**Ejemplo de asignación:**

| Rol           | Permisos típicos                                                            |
| ------------- | --------------------------------------------------------------------------- |
| Administrador | Todos los módulos: maestros, usuarios, roles, inventario, compras, reportes |
| Bodeguero     | `producto.ver`, `stock.ver`, `movimiento.crear`, `kardex.ver`               |
| Ventas        | `producto.ver`, `stock.ver`, `cliente.*`, `venta.*`                         |
