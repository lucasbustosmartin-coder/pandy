# Orden visual de tipos de operación

## Objetivo

Definir en qué **orden** aparecen los tipos en:

- Selector de **Nueva orden** / **Editar orden**
- **Cargar por chat**
- Vista **Tipos de operación** (listado ABM)

El criterio ya **no** es solo orden alfabético por `codigo`: se persiste un entero `orden_visual` en `tipos_operacion`.

## Base de datos

Ejecutar en Supabase (una vez):

`sql/migracion_tipos_operacion_orden_visual.sql`

Si **no** se ejecutó la migración, la app vuelve a consultar tipos **sin** `orden_visual` (orden por código) y muestra un **aviso único por sesión** con `showToast` indicando el script SQL. Los errores de carga también se notifican por toast además del mensaje en tabla cuando aplica.

- Columna `orden_visual integer NOT NULL` (valores más bajos = más arriba en la lista).
- Migración inicial: rellena con `10, 20, 30…` según `codigo`, `usa_intermediario`, `id` (equivalente al orden previo por código).

## UI (ABM)

En **Tipos de operación**, columna **Orden**: botones **subir** / **bajar** (solo con permiso `abm_tipos_operacion`). Intercambian `orden_visual` con la fila vecina.

Los usuarios **sin** ABM ven el número de orden (solo lectura).

Al **crear** un tipo nuevo, la app asigna `max(orden_visual) + 10` para que quede al final.

## Nota de producto (futuro)

La **instrumentación** (transacciones, reglas, caja) deberá seguir adaptándose a las **monedas que participan** (`moneda_in` / `moneda_out`), no depender solo del código del tipo. Este documento solo cubre el **orden de listado** en UI.
