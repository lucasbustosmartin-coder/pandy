# Tipos de operación: código duplicado y intermediario

## Objetivo

Permitir **dos variantes del mismo par de negocio** (mismo `codigo`, p. ej. `USD-ARS`):

- una **sin intermediario** (`usa_intermediario = false`);
- otra **con intermediario** (`usa_intermediario = true`).

El usuario las distingue por el **nombre** en el selector de órdenes (ej. “USD - ARS (sin intermediario)” vs “USD - ARS (con intermediario)”).

## Base de datos

- Tras `sql/migracion_tipos_operacion_unique_codigo_usa_intermediario.sql`, la unicidad es **`(codigo, usa_intermediario)`**, no solo `codigo`.
- Las órdenes siguen referenciando **`tipo_operacion_id`** (UUID).

## Cuenta corriente (reglas)

- `cc_modelo_reglas` sigue usando **`tipo_operacion_codigo` + `usa_intermediario`** como dimensión.
- El motor en `main.js` debe cargar reglas con **`usa_intermediario` del tipo elegido** (`tipos_operacion.usa_intermediario`), **no** inferido solo desde `ordenes.intermediario_id`.

## Migración

1. Ejecutar `sql/migracion_tipos_operacion_unique_codigo_usa_intermediario.sql` en Supabase (después de `migracion_tipos_operacion_usa_intermediario.sql`).
2. Ese script crea la segunda fila `USD-ARS` con intermediario y copia la matriz CC desde `CHEQUE-ARS` con intermediario (punto de partida; ajustar reglas si el negocio lo requiere).

## Alta en la app

- Al guardar un tipo, si ya existe otro con el mismo **código** y el mismo **toggle Intermediario**, la app muestra error (y la base también lo impediría).
