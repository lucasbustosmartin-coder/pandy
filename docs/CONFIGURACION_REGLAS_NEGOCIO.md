# Configuración de reglas de negocio (Admin)

Las reglas que restringen o permiten acciones en la app se apoyan en la tabla **`app_config`** (clave-valor). Solo usuarios con rol **Admin** pueden ver y editar estos valores (desde Seguridad o una futura pantalla Configuración).

## Tabla app_config

- **key** (text, PK): nombre de la regla o parámetro.
- **value** (text): valor (número, "true"/"false", etc.; la app lo interpreta).
- **updated_at**, **updated_by**: auditoría.

RLS: todos los autenticados pueden **leer**; solo Admin puede **INSERT/UPDATE**.

## Claves de reglas (actuales y previstas)

| Clave | Descripción | Valor por defecto | Uso en la app |
|-------|-------------|-------------------|----------------|
| `session_timeout_minutes` | Minutos de inactividad antes de cerrar sesión. | 60 | loadSeguridad, checkSessionTimeout |
| `reversar_max_veces` | Cuántas veces se puede reversar una transacción de ejecutada a pendiente (por transacción). 0 = no permitir; 1 = una vez (recomendado). | 1 | cambiarEstadoTransaccion: si 0 bloquea toda reversión; si 1 aplica lógica con columna revertida_una_vez. |
| *(futuro)* `permitir_editar_monto_ejecutada` | Si se puede editar el monto de una transacción ya ejecutada. | false | saveTransaccion, guardarSoloMontoTransaccion |
| *(futuro)* `permitir_editar_modo_pago_ejecutada` | Si se puede cambiar el modo de pago de una transacción ejecutada. | false | guardarSoloModoPagoTransaccion |

## Cómo agregar una nueva regla

1. **SQL**: `INSERT INTO app_config (key, value) VALUES ('mi_regla', 'valor_defecto') ON CONFLICT (key) DO NOTHING;`
2. **App**: en el flujo correspondiente, leer `app_config` por esa clave (con fallback al valor por defecto) y aplicar la restricción o el permitido.
3. **UI Admin**: cuando exista pantalla de configuración, agregar el control (input, toggle) que haga UPDATE en `app_config` para esa clave.

## Mensajes y advertencias

Los mensajes al usuario (reversión, límites, etc.) pueden hacerse **contextuales** usando datos de la transacción (monto, moneda, tipo ingreso/egreso), por ejemplo: *"Reversar indica que no se recibieron los 50.000 ARS del cliente."* La regla (cuántas veces se puede reversar) sigue leyéndose de `app_config`; el texto puede armarse en la app según la operación.
