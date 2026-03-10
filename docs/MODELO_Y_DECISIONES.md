# Pandi – Modelo de datos y decisiones de diseño

## Decisiones cerradas

1. **Cuenta corriente:** saldo por cliente **y por moneda** (USD, EUR, ARS). Cada cliente tiene hasta tres saldos.
2. **Órdenes – estados y etapas:** la orden tiene un ciclo de vida con estados:
   - **Cotización:** etapa inicial (cotización al cliente).
   - **Cierre:** orden cerrada/acordada (aún no ejecutada).
   - **Concertación:** transacción física realizada (operación efectivamente hecha).
   Se manejará con campo `estado` (y opcionalmente `etapa`) en la tabla `ordenes`. Solo en concertación se impactan caja y cuenta corriente.
3. **Movimientos de caja no asociados al core:** permitidos, con **ABM de Tipos de Movimiento** integrado. Ejemplo: Tipo de Movimiento (nombre), dirección **Ingreso** o **Egreso**. Los movimientos de caja pueden estar ligados a una orden (core) o a un tipo de movimiento (manual/ajuste).
4. **Roles:** Admin, Encargado, Visor (como en la propuesta inicial).

---

## Modelo de datos (resumen)

### Tablas de negocio

| Tabla | Descripción |
|-------|-------------|
| **clientes** | ABM de clientes. id, nombre, documento, email, teléfono, dirección, activo, creado_at, etc. |
| **ordenes** | Órdenes de compra/venta de divisas. cliente_id, fecha, **estado** (cotizacion \| cerrada \| concertada), moneda_que_recibe_empresa, moneda_que_entrega_empresa, monto_recibido, monto_entregado, cotizacion, usuario_id, observaciones. Solo cuando estado = concertada se generan movimientos de caja y de cuenta corriente. |
| **tipos_movimiento_caja** | ABM. id, nombre, direccion (ingreso \| egreso), activo. Para movimientos de caja manuales (no orden). |
| **movimientos_caja** | Moneda, monto (+/-), orden_id o tipo_movimiento_id, concepto, fecha, usuario_id. **estado** ('cerrado' \| 'anulado'), **estado_fecha** (log). Solo estado = cerrado suma al saldo. |
| **movimientos_cuenta_corriente** | cliente_id, moneda, monto (+/-), orden_id (nullable), concepto, fecha, usuario_id. **estado** ('cerrado' \| 'anulado'), **estado_fecha** (log). Solo estado = cerrado suma al saldo. |

### Tablas de seguridad (como Everfit)

- **user_profiles** (id, email) – enlace con auth.users.
- **app_role** (role, label): admin, encargado, visor.
- **app_permission** (permission, description) – permisos editables.
- **app_role_permission** – qué rol tiene qué permiso.
- **app_user_profile** – user_id, role.

### Convenciones

- **Caja:** positivo = ingreso a caja, negativo = egreso. Saldo = SUM(monto) por moneda.
- **Cuenta corriente:** convención a fijar (ej. positivo = cliente nos debe, negativo = nosotros le debemos) y mantener en toda la app.
- **Orden en estado “concertada”:** al pasar a ese estado se crean los movimientos_caja y movimientos_cuenta_corriente con estado = cerrado (una vez por orden). Al revertir la orden no se borran: se actualiza estado = anulado y estado_fecha (log).

---

## Flujo de una orden

1. **Cotización** → se crea orden en estado `cotizacion` (opcional: guardar cotización).
2. **Cierre** → se actualiza orden a estado `cerrada` (acuerdo, aún no ejecutado).
3. **Concertación** → se actualiza a `concertada` y se disparan los movimientos de caja y de cuenta corriente (triggers o lógica en app).

Movimientos manuales de caja: se elige moneda, tipo de movimiento (del ABM), monto, concepto; no se vincula a orden.
