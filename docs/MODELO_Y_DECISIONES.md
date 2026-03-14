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

---

## Modelo de consistencia: orden e instrumentación mandan; CC y caja se derivan

**Principio (válido para cualquier tipo de operación):**

- La **fuente de verdad** es la **orden** y su **instrumentación** (las transacciones: quién paga, quién cobra, monto, moneda, modo de pago, estado, etc.).
- **Cuenta corriente** (cliente e intermediario) y **caja** son **información derivada**: deben ser **conciliación pura** de lo que dice la orden y las transacciones.
- Cualquier cambio en la instrumentación (alta/baja de transacción, cambio de estado, cambio de monto, cambio de medio de pago, idas y vueltas) debe propagar de forma **consistente** a CC y caja. La pregunta siempre es: *“Cambió una instrucción → ¿cómo afecta la CC (y la caja)?”* — y el desarrollo debe responder con una regla única e infalible, no con lógica distinta por tipo de operación.

**Interpretar el acuerdo, no el caso particular:**

- El modelo debe **comprender todo lo que conlleva la instrumentación** en función del **acuerdo comercial**: quiénes participan (cliente, intermediario, Pandy), en qué rol (quién paga, quién cobra, en qué moneda y medio), qué recibe y qué entrega cada uno, y **qué gana cada uno** (comisiones de Pandy, comisión del intermediario, etc.).
- A partir de esa interpretación se derivan de forma **única y consistente** los movimientos de CC (cliente e intermediario) y de caja. Así el sistema es **robusto para cualquier combinación** (con/sin intermediario, distintos medios de pago, varias comisiones), no solo para un caso concreto.
- Cualquier cambio futuro (nuevos roles, nuevos tipos de acuerdo) debe integrarse en esa **interpretación del acuerdo** y en las reglas de derivación, no en ramas de código "para este caso".

**Implicación para el desarrollo:**

- La lógica no debe ser “para ARS-ARS hacemos X, para USD-USD hacemos Y”, sino: **dado el estado actual de la orden y de todas sus transacciones**, existe una **regla de derivación** que determina qué movimientos de CC y qué movimientos de caja deben existir (y con qué montos y estado).
- Idealmente, un único flujo de **sincronización / conciliación**: “a partir de esta orden y sus transacciones, (re)calcular y actualizar CC y caja para que coincidan”. Ese flujo se invoca cada vez que algo cambia en la orden o en la instrumentación (guardar orden, cambiar estado de transacción, cambiar monto, etc.).
- Así el modelo se mantiene infalible para cualquier tipo de operación, con idas y vueltas, cambios de monto y de medio de pago: la consistencia se asegura por derivación desde orden + transacciones.
