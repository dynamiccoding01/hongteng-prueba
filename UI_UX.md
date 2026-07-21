# UI / UX

## Principios de diseño

- **Pensado para operadores de bodega:** búsquedas rápidas, carga ágil, pocos clics por operación (RNF Usabilidad).
- **Bilingüe:** interfaz en español; descripciones y códigos pueden mostrarse también en chino (中文) cuando aplique.
- **Doble unidad siempre visible:** toda pantalla de stock muestra cajas y unidades/pares en paralelo.
- **Tiempo real:** el stock se actualiza en vivo entre usuarios (Supabase Realtime), sin refrescar la página.

## Stack de UI

Tailwind CSS + shadcn/ui (componentes accesibles) + TanStack Table (grillas con filtros, orden y paginación).

## Pantallas principales (Fase 1)

| Pantalla              | Contenido clave                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Login                 | Acceso con correo/contraseña (Supabase Auth); redirección por rol                              |
| Dashboard / Resumen   | Existencias por categoría (equivalente a la hoja 汇总), totales en cajas y unidades            |
| Buscador de artículos | Búsqueda global por código/descripción; muestra existencia y zona de ubicación (REP-03)        |
| Catálogo de productos | Grilla con SKU, categoría, tallas, pares por caja, descripción bilingüe; alta/edición (MAE-01) |
| Maestros              | Categorías, zonas de bodega, proveedores, clientes (MAE-03 a MAE-05)                           |
| Stock por zona        | Existencias por producto y ubicación, en cajas y unidades (INV-01)                             |
| Movimientos           | Registro de entrada/salida/ajuste con fecha, usuario y referencia (INV-02)                     |
| Kardex                | Historial cronológico de movimientos y saldos por producto (INV-03)                            |
| Importaciones         | Registro de compras con detalle por producto e ingreso automático a stock (COM-01/03)          |
| Administración        | Usuarios, roles y permisos; bitácora de auditoría (ADM-01/02)                                  |

## Convenciones

- Tablas con exportación a Excel donde aplique (REP-06).
- Formularios validados con Zod; mensajes de error en español.
- Diseño responsive: uso principal en desktop/notebook de bodega; consultas también desde tablet.
