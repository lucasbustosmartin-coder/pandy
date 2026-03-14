# Reglas de negocio configurables (Admin)

Las restricciones y permitidos que afectan transacciones, reversiones y edición se apoyan en la tabla **`app_config`** (clave-valor). Solo usuarios con rol **Admin** pueden ver y editar estos valores (desde Seguridad o una futura pantalla Configuración).

## Claves existentes

| Clave | Descripción | Valores | Por defecto |
|-------|-------------|---------|-------------|
| `session_timeout_minutes` | Minutos de inactividad antes de cerrar sesión | 1–1440 | 60 |
| `reversar_max_veces` | Cuántas veces se puede reversar una transacción de ejecutada a pendiente (por transacción) | 0 = no permitir, 1 = una vez | 1 |

## Uso en la app

- **Reversar estado:** En `cambiarEstadoTransaccion`, si el usuario intenta pasar a pendiente: se lee `reversar_max_veces`. Si es 0 se muestra mensaje y no se permite. Si es 1 se usa la lógica actual (columna `revertida_una_vez` en transacciones).
- Otras reglas (ej. permitir editar monto cuando ejecutada, mensajes contextuales por tipo de transacción) pueden sumar nuevas claves en `app_config` y leerse en los mismos flujos.

## Dónde se editan

- Hoy: en **Seguridad** solo se expone el tiempo de inactividad. Las demás claves se pueden cambiar desde Supabase (SQL o Table Editor) o agregando controles en Seguridad.
- Futuro: sección "Reglas de negocio" o vista Configuración para Admin con inputs por clave.

## Migraciones

- `sql/app_config_session_timeout.sql` — crea `app_config` e inserta `session_timeout_minutes`.
- `sql/migracion_app_config_reglas_reversar.sql` — inserta `reversar_max_veces` con valor 1 (ON CONFLICT DO NOTHING).
