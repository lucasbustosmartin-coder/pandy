# CC y caja derivados de orden e instrumentación

Este doc describe el **modelo objetivo** y cómo llevarlo al código. Ver también `MODELO_Y_DECISIONES.md` (sección “Modelo de consistencia”).

## Principio

- **Orden + instrumentación (transacciones)** = fuente de verdad.
- **CC (cliente e intermediario) y caja** = **derivados**: conciliación pura de esa fuente.
- Cualquier cambio en la orden o en las transacciones (estado, monto, medio de pago, alta/baja de transacción, idas y vueltas) debe propagar a CC y caja con **una misma regla**, válida para **cualquier tipo de operación**.

La derivación debe basarse en **interpretar el acuerdo comercial**: participantes (cliente, intermediario, Pandy), roles (quién paga/cobra, en qué moneda y medio), qué recibe/entrega cada uno y qué gana cada uno (comisiones). Así la lógica sirve para todos los casos, no para un escenario particular. Ver `MODELO_Y_DECISIONES.md` (sección "Interpretar el acuerdo, no el caso particular").

## Objetivo de implementación

En lugar de lógica repartida (“si ARS-ARS hacemos X”, “si ejecutada insertamos Cancelación”, “si split hacemos Y”), tender a:

1. **Reglas de derivación** claras y únicas:
   - Dada una orden y el conjunto de sus transacciones (con estado, monto, cobrador, pagador, moneda, etc.), definir **qué filas** deben existir en `movimientos_cuenta_corriente`, `movimientos_cuenta_corriente_intermediario` y `movimientos_caja`, con qué montos y qué estado (pendiente/cerrado/anulado).
2. **Un flujo de sincronización** (por orden):
   - Entrada: `orden_id`.
   - Lee orden + todas las transacciones de su instrumentación.
   - A partir de ellas **calcula** el conjunto esperado de movimientos de CC cliente, CC intermediario y caja.
   - Compara con lo que hay en BD y **actualiza/inserta/borra** para que queden iguales (conciliación).

3. **Puntos de invocación**: cada vez que cambie algo que afecte la derivación:
   - Guardar orden (concertación, montos, tipo, intermediario, etc.).
   - Crear/editar/borrar transacción.
   - Cambiar estado de transacción (pendiente ↔ ejecutada).
   - Cambiar monto o medio de pago de una transacción.

Así, “cambió una instrucción → ¿cómo afecta la CC?” se responde siempre con: **vuelve a correr la sincronización para esa orden**.

## Ventajas

- Una sola regla para todos los tipos de operación (ARS-ARS, USD-USD, con/sin intermediario, etc.).
- Idas y vueltas (revertir, cambiar monto) se resuelven re-sincronizando, sin caminos especiales “revertir CC” o “revertir caja”.
- Más fácil de auditar y de testear: dado orden + transacciones, el resultado en CC y caja es determinista.

## Pasos posibles (refactor gradual)

1. **Documentar las reglas de derivación** por tipo de movimiento (ej. “transacción ingreso, pagador=cliente, ejecutada → una fila CC cliente con tal signo/monto y estado cerrado”) y por agregación de comisiones si aplica.
2. **Implementar la función de sincronización** `sincronizarCcYCajaDesdeOrden(ordenId)` que, leyendo orden + transacciones, (re)genera los movimientos de CC y caja para esa orden (por ejemplo borrando los vinculados a esa orden y volviendo a insertar, o comparando y haciendo update/insert/delete).
3. **Sustituir de a poco** los puntos donde hoy se hace “insert Cancelación”, “update Debe”, “insert caja”, etc., por una llamada a `sincronizarCcYCajaDesdeOrden(ordenId)` después de cada cambio relevante en la orden o en sus transacciones.
4. **Eliminar** la lógica duplicada o específica por tipo de operación que pase a estar cubierta por la derivación única.

Este doc sirve como guía para ese refactor; no fija el orden concreto de los pasos ni el detalle de cada regla (eso se puede bajar a otro doc o a comentarios en código cuando se implemente).

---

## Migración de estructura (modelo robusto)

El script **`sql/migracion_cc_caja_orden_robusto.sql`** refuerza el modelo en BD:

1. **movimientos_caja**: Se permite que un movimiento tenga a la vez `orden_id` y `transaccion_id` (origen por orden). Así cada fila de caja derivada de una transacción queda ligada a la orden; el sync puede seguir borrando por `transaccion_id in (...)` y desde la app se rellena `orden_id` al insertar. Se hace backfill de `orden_id` en filas existentes que ya tenían `transaccion_id`.

2. **Integridad referencial**: Se agregan CHECK en `movimientos_cuenta_corriente` y `movimientos_cuenta_corriente_intermediario`: cuando están informados tanto `orden_id` como `transaccion_id`, la transacción debe pertenecer a esa orden (vía `instrumentacion`). Función auxiliar `transaccion_pertenece_a_orden(orden_id, transaccion_id)`.

Ejecutar la migración en Supabase SQL Editor una vez; después el modelo queda consistente a nivel de esquema.
