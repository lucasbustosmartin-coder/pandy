# Análisis: modal Editar transacción cuando la transacción está ejecutada

## Situación

Con transacciones ya en estado **ejecutada**, el modal "Editar transacción" y la edición en tabla (Órdenes, Órdenes pendientes) permiten editar tipo, modo de pago, moneda, monto, cobrador, pagador, estado, concepto, tipo de cambio.

## Principio acordado

**La regla conceptual de CC no debería romperse si siempre re-estructuramos la regla cuando el usuario edita.** Es decir: al guardar cualquier cambio (monto, estado, modo de pago, etc.), el sistema debe re-aplicar la lógica de CC y caja (revertir el impacto anterior si corresponde y aplicar el nuevo) para que el saldo siga cerrando. El estado debe quedar editable para que el usuario pueda corregir (ej. pasar de vuelta a pendiente si se equivocó).

## Qué hace hoy

- **Cambio de estado** (en tabla o modal): `cambiarEstadoTransaccion` y el flujo de `saveTransaccion` ya re-estructuran: al pasar a pendiente se borran Cancelaciones y se revierten filas; al pasar a ejecutada se inserta Cancelación, split si aplica, etc.
- **Cambio de monto / modo de pago** en la **tabla**: implementado. `guardarSoloMontoTransaccion` y `guardarSoloModoPagoTransaccion` reajustan CC y caja cuando la transacción está ejecutada (revierten Cancelación/caja anterior, actualizan resto pendiente si hay momento cero, insertan nueva Cancelación y caja).
- **Guardar desde el modal**: implementado. Al editar (id), se revierte Cancelación y caja de esa transacción antes de re-aplicar; en el split se actualiza la transacción "resto" existente en lugar de crear una nueva cuando corresponde.

## Decisión actual (implementada)

- No restringir la edición: modo de pago, importe y estado siguen editables en todos los accesos.
- Todo flujo de guardado que toque monto, estado o modo de pago en una transacción ejecutada **re-estructura** CC y caja para que la regla conceptual se cumpla siempre.
