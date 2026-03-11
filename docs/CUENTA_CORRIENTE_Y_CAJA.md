# Cuenta corriente y Caja/Bancos: cuándo se registran movimientos

## Regla de negocio

- **Cuenta corriente (cliente e intermediario):** debe reflejar **todos** los movimientos en **cualquier** estado de la transacción (pendiente y ejecutada). La CC muestra la situación real de lo que se debe/cobra con cada parte a medida que se instrumenta y ejecuta.
- **Caja y Bancos:** solo se impactan cuando la transacción está en estado **ejecutada**. El efectivo/banco de Pandy solo se mueve cuando la operación se ejecuta.

## Momentos en que se registran movimientos

### Cuenta corriente (movimientos_cuenta_corriente y movimientos_cuenta_corriente_intermediario)

1. **Al guardar o editar una transacción** (`saveTransaccion`): siempre se borran los movimientos CC de esa transacción y se vuelven a crear según cobrador/pagador y estado (pendiente → concepto "Transacción pendiente", ejecutada → "Transacción ejecutada").
2. **Al cambiar el estado** pendiente ↔ ejecutada (`cambiarEstadoTransaccion`): mismo criterio; la CC se actualiza en ambos sentidos.
3. **Al auto-completar la instrumentación** (sin intermediario o CHEQUE con intermediario): las transacciones creadas automáticamente generan desde el inicio sus movimientos en CC en estado "Transacción pendiente". Helper: `insertarMovimientosCcParaTransaccion`.
4. **Al eliminar una transacción** (dar de baja): se eliminan los movimientos de CC asociados a esa transacción.
5. **Movimientos de cierre por orden ejecutada** (`generarMovimientoConversionCc`, `generarMovimientoConversionCcIntermediario`): cuando la orden pasa a "orden_ejecutada", se generan movimientos adicionales (Conversión de moneda, Comisión del acuerdo) para saldar la cuenta por esa orden. Solo consideran transacciones ejecutadas.

### Caja y Bancos (movimientos_caja)

1. **Solo cuando la transacción está ejecutada:** al guardar una transacción en estado ejecutada, o al cambiar una transacción de pendiente a ejecutada, se inserta el movimiento de caja (ingreso/egreso según Pandy cobra/paga). Modo de pago define Efectivo vs Banco.
2. **Al pasar a pendiente:** si se cambia una transacción de ejecutada a pendiente, se elimina el movimiento de caja de esa transacción.
3. **Al eliminar una transacción:** se elimina también el movimiento de caja asociado.

## Cálculo del saldo (positivo/negativo)

- **Saldo por moneda** = **Compromiso por órdenes (solo no ejecutadas)** menos **movimientos ya registrados**.
- **Compromiso:** solo cuentan las órdenes que aún no están en estado “orden_ejecutada”. Para cada una: el cliente/intermediario “debe” lo que nosotros recibimos (+ en moneda_recibida) y nosotros “debemos” lo que entregamos (− en moneda_entregada). Las órdenes ya ejecutadas no suman al compromiso: su impacto (incl. la ganancia/comisión del acuerdo) queda reflejado solo en los movimientos de CC.
- **Movimientos ya registrados (para restar):** se restan los movimientos **ejecutados/cierre** (por ejemplo “Transacción ejecutada”, “Conversión de moneda”, “Comisión del acuerdo”) y cualquier ajuste manual. Los movimientos de concepto **“Transacción pendiente” no se restan**, para evitar doble conteo (ya están incluidos en el compromiso de la orden).
- Así, si una pata está ejecutada y la otra pendiente, el saldo refleja la exposición que queda por moneda. Cuando la orden pasa a ejecutada, deja de sumar al compromiso y su cierre queda reflejado solo en movimientos.
- En el detalle de CC (modal) se muestra la sección **Operaciones que participan del saldo**: listado de órdenes que aportan al compromiso (fecha, orden, monedas y montos, estado).

## Resumen

| Acción | Cuenta corriente | Caja/Bancos |
|--------|------------------|-------------|
| Crear/editar transacción **pendiente** | Sí | No |
| Crear/editar transacción **ejecutada** | Sí | Sí |
| Cambiar estado a ejecutada | Sí | Sí (crea movimiento) |
| Cambiar estado a pendiente | Sí (actualiza concepto) | Sí (borra movimiento) |
| Auto-completar instrumentación | Sí (todas las transacciones creadas) | No |
| Orden ejecutada (conversión/comisión) | Sí (movimientos de cierre) | No (ya se impactó por cada transacción ejecutada) |
| Eliminar transacción | Se borran movimientos de esa transacción | Se borra movimiento de esa transacción |

Implementación: `main.js` (saveTransaccion, cambiarEstadoTransaccion, insertarMovimientosCcParaTransaccion, autoCompletarInstrumentacion*, eliminarTransaccion, generarMovimientoConversionCc*).
