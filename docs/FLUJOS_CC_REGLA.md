# Flujos que impactan cuenta corriente y cumplimiento de la regla

**Regla obligatoria:** La cuenta corriente **siempre** tiene que cerrar con la regla conceptual (saldo = suma de movimientos; cada movimiento por el monto realmente ejecutado; sin doble conteo). Si en algún cambio o feature el saldo no cierra, hay que preguntar antes de dar por cerrado.

**Regla infalible para el saldo mostrado (cliente e intermediario):** El **saldo** = suma **solo** de movimientos con **estado = cerrado** (se excluyen anulado y pendiente). No se suma ni se resta ningún "pendiente" al número. Así, al pasar una transacción a pendiente, la fila de movimiento queda en pendiente y deja de sumar; el saldo refleja solo lo ya ejecutado (ej. solo Comisión cerrada → saldo = +1.359,11 a favor de Pandy). Los pendientes solo se usan para: (1) mostrar la fila cuando no hay movimientos cerrados pero sí hay pendiente (ej. deuda Pandy→Int); (2) en esa celda, mostrar el monto pendiente en rojo/verde.

Referencia conceptual: **docs/REGLA_CC.xlsx**. **Regla simple e infalible (vigente):** **docs/REGLA_CC_SIMPLE_INFALIBLE.md** — solo transacciones **ejecutadas** generan movimientos; signo por pagador/cobrador. El saldo se calcula **solo** desde las tablas `movimientos_cuenta_corriente` y `movimientos_cuenta_corriente_intermediario` (suma de movimientos; solo se excluye `estado = 'anulado'`).

## 1. Momento cero (regla única para todo tipo de operación)

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| **Sin intermediario** (`autoCompletarInstrumentacionSinIntermediario`) | Crea 2 transacciones; llama `insertarMovimientosCcMomentoCero`: 2 filas en CC cliente (**Debe** -mr/-me y **Compensación** +mr/+me). | Sí. |
| **CHEQUE con intermediario** (`autoCompletarInstrumentacionChequeConIntermediario`) | Crea 4 transacciones; llama **ambas**: `insertarMovimientosCcMomentoCero` (CC cliente: ingreso cliente→Pandy, egreso Pandy→cliente) y `insertarMovimientosCcMomentoCeroIntermediario` (CC intermediario: Debe por el cheque Pandy→Intermediario). | Sí. Misma regla conceptual: momento cero = cargar en pendiente en ambas CC. |

En ambos casos no se tocan montos al ejecutar; solo estado. La regla es única y conceptual para cualquier tipo de operación.

## 2. Cambiar estado transacción (pendiente ↔ ejecutada)

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| `cambiarEstadoTransaccion` | **Cliente:** actualiza solo `estado`/`estado_fecha` en filas existentes. Si es momento cero y ejecutada → INSERT "Cancelación de deuda" por el **monto de la transacción** (item.monto), con signo según quien paga (cliente → +monto en monR y proporcional en monE; Pandy → -monto en monE y proporcional en monR). Si vuelve a pendiente → borra Cancelaciones de esa transacción. **Legacy:** para transacciones que no son momento cero, inserta filas cobro/deuda (una moneda por fila). | Sí. |
| | **Auto-compensación (split):** si la transacción es de momento cero pero el **monto guardado** es distinto al que representa la fila (ej. Alvarito paga 500 en vez de 1000, o luego 300 en vez de 500): se **cierra** la transacción por el monto ejecutado y se **crea una nueva transacción** por el **resto** (diferencia). La diferencia es siempre **monto actual de la fila Debe/Comp − monto ejecutado**, no el total de la orden; así funciona con pagos parciales encadenados. En CC: Cancelación por el monto ejecutado; se actualizan las filas al resto y se reasigna la fila a la nueva transacción. Igual criterio para egreso. | Sí. |
| | **Intermediario:** misma regla que cliente. Al pasar a **pendiente**: solo filas con esa transacción: Debe (monto &lt; 0) → UPDATE estado pendiente; cobro (monto &gt; 0) → DELETE. Sin flip monto. Al ejecutada: actualizar fila momento cero a cerrado o insert si no existe. | Sí. |

## 3. Guardar transacción (modal Editar)

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| `saveTransaccion` | No borra filas con `monto_usd`/`monto_ars`/`monto_eur` (momento cero). Para CC intermediario al re-aplicar: no borra todas las filas por `transaccion_id`; revierte igual que cliente (Debe → estado pendiente, cobro → delete). Luego inserta/actualiza según estado ejecutada. Si **no** hay momento cero para esa transacción, inserta movimientos legacy (cobro/deuda e intermediario según cobrador/pagador). | Sí. |

## 4. Anular orden

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| Flujo unificado (`solicitarConfirmacionYAnularOrden` / `ejecutarAnulacionOrdenCompleta` / `anularMovimientosCcYCajaNoManualPorOrden`) | Siempre: `ordenes.estado = 'anulada'` (también si la orden estaba en `orden_ejecutada`, con confirmación reforzada en UI). **Si todas** las transacciones están **pendientes** (o no hay): **no** se tocan CC ni caja. **Si no:** mismos UPDATE que antes, vía función única (cliente + intermediario, no manual + caja). | Sí. |
| Confirmación y auditoría | Advertencia explícita; si estaba ejecutada, texto y botón de confirmación reforzados; botón rojo en tabla/modal. `auditoria_app` con `orden_estaba_ejecutada` cuando aplica. Permiso `anular_orden`. RLS: `sql/migracion_rls_anular_orden_cc_caja.sql`. | — |
| Guardar orden (`saveOrden`) | Tras persistir la orden y comisiones, solo cierra modal y refresca listados; **no** anula CC/caja (eso queda solo en el flujo Anular orden). | — |

El saldo en la vista **excluye** movimientos con `estado === 'anulado'` (ver más abajo).

## 5. Eliminar transacción (dar de baja)

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| `eliminarTransaccion` | Si la transacción tiene movimientos con `monto_usd`/`monto_ars`/`monto_eur` (momento cero), **no se permite** dar de baja; se muestra toast indicando usar "Anular orden". Si no es momento cero, borra movimientos CC (y caja) por `transaccion_id` y la transacción. | Sí. Evita desbalance (quedar solo Debe o solo Compensación). |

## 6. Editar movimiento CC (concepto/fecha)

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| `saveMovimientoCc` | UPDATE solo `concepto` y `fecha`. **No** se modifican `monto`, `monto_usd`, `monto_ars`, `monto_eur`. | Sí. El saldo sigue siendo la suma de montos; cambiar el texto del concepto puede afectar solo el agrupamiento por orden en la vista si se quita "nro orden N". |

## 7. Cálculo del saldo en la vista

| Dónde | Acción | Cumple regla |
|-------|--------|---------------|
| `loadCuentaCorriente` / `buildCcResumenRows` | **Regla infalible:** El saldo mostrado = **solo** suma de movimientos (sin sumar ni restar pendientes). Cliente e intermediario igual. Se traen movimientos; en `saldosDesdeMovimientosPorOrden` se excluye solo `estado === 'anulado'`. Los mapas de pendientes (`contribucionPendienteCcUnificada`, `promPendientesCcGlobal`) se usan solo para: mostrar la fila cuando saldo = 0 pero hay pendiente, y en esa celda mostrar el monto pendiente (rojo/verde). Así, al pasar una transacción a pendiente, el movimiento se revierte y el saldo refleja solo lo ejecutado (ej. solo Comisión → +1.359,11). | Sí. |

## 8. Comisiones generadas (Ganancia Pandy, Comisión intermediario)

Para que la cuenta corriente cierre y no se dupliquen transacciones al pasar ejecutada→pendiente→ejecutada:

- **Tabla `orden_comisiones_generadas`**: una fila por `(orden_id, tipo)` con `tipo` en `ganancia_pandy` o `comision_intermediario` y el `transaccion_id` de la transacción creada. Opcionalmente `transaccion_id_reducida` para Ganancia (ingreso cliente del que se descontó la comisión; se restaura al revertir).
- **Crear Ganancia / Comisión**: se usan `asegurarGananciaPandy` y `asegurarComisionIntermediario`, que consultan la tabla y solo crean (transacción + caja + CC + fila) si aún no existe.
- **Reversa (ejecutada→pendiente)**:
  - Si se revierte **egreso Pandy→Int**: `revertirComisionIntermediario(ordenId)` borra la transacción de comisión, sus movimientos de caja y CC y la fila en la tabla.
  - Si se revierte **ingreso Int→Pandy**: se borran los movimientos CC de esa transacción (cobro y descuento) y se reabre la fila Compensación a pendiente.
  - Si se revierte una transacción **cliente** y el cliente deja de estar “completo” (suma ejecutada &lt; mr/me): `revertirGananciaPandy` restaura el ingreso reducido, borra la transacción Ganancia, caja y CC y la fila en la tabla.

Regla: **saldo CC = suma de movimientos**. Al revertir se quitan o compensan exactamente los movimientos que se habían sumado.

## 9. Flujos que no se usan con momento cero

- **`insertarMovimientosCcParaTransaccion`**: definida pero no invocada desde la app actual; era para impacto CC al crear transacciones ejecutadas en otros flujos.
- **`generarMovimientoConversionCc`** / **`generarMovimientoConversionCcIntermediario`**: ya no se llaman; con la regla de momento cero + Cancelación no se generan movimientos "Conversión de moneda".

## Resumen

- **Solo** se escriben movimientos que respetan la regla: momento cero = 2 filas (Debe + Compensación); ejecución = Cancelación con signo correcto + update estado.
- Los movimientos **anulados** no cuentan en el saldo.
- No se puede borrar una transacción que forma parte del momento cero.
- **CC intermediario = misma regla que CC cliente:** saldo solo desde movimientos (resumen y modal detalle); reversión al pasar a pendiente igual (solo estado en filas momento cero, borrar cobro; sin flip monto). Aplicado en `cambiarEstadoTransaccion` y en `saveTransaccion` (revertCcInt).

## Relojería (sincronización al cerrar)

- Al cerrar el modal de orden: se sincronizan los montos de la tabla de instrumentación (cada `input-monto-transaccion-tabla` se guarda con `guardarSoloMontoTransaccion`) para no perder cambios si el usuario no hizo blur. Luego se cierran los toasts visibles (`dismissAllToasts`) y el modal.
- Al cerrar el modal de transacción: se cierran los toasts visibles y el modal.

## Edición de transacciones (modal y tabla)

- Modal y tabla permiten editar modo de pago, importe y estado también cuando la transacción está ejecutada. **Siempre se reajusta CC y caja** según los cambios: `guardarSoloModoPagoTransaccion` reajusta caja (borra movimiento anterior, inserta uno con el nuevo modo); `guardarSoloMontoTransaccion` revierte Cancelación/caja, actualiza o crea transacción resto pendiente, inserta nueva Cancelación y caja; `saveTransaccion` al editar revierte Cancelación/caja de esa transacción y re-aplica (en split actualiza la transacción resto existente en lugar de crear otra). Detalle: `docs/ANALISIS_MODAL_TRANSACCION_EJECUTADA.md`.

## Regla de split en sintonía con CC y caja (cualquier tipo de operación)

Para que la instrumentación, la cuenta corriente y la caja queden coherentes en **todos** los tipos de operación (con o sin intermediario, con o sin momento cero):

1. **Split con momento cero** (orden sin intermediario): al ejecutar con monto menor al compromiso se crea transacción pendiente por la diferencia; se actualizan filas Debe/Compensación; se inserta Cancelación por el monto ejecutado; **caja**: un movimiento por transacción ejecutada, con **signo** = ingreso (+monto) si Pandy es cobrador, egreso (-monto) si Pandy es pagador (`cambiarEstadoTransaccion` y `saveTransaccion` usan `signo * monto`).

2. **Split sin momento cero** (ej. ARS-ARS CHEQUE con intermediario): al ejecutar o guardar con monto menor al compromiso (ingreso pagador=cliente con monto menor a mr, egreso cobrador=cliente con monto menor a me) se crea transacción pendiente por la diferencia; CC legacy (Cobro/Deuda) solo por el monto ejecutado; **caja** con el mismo criterio de signo. Aplicado en: `cambiarEstadoTransaccion`, `saveTransaccion` (continuarFlujo) y `guardarSoloMontoTransaccion` (al editar monto en tabla y ya ejecutada).

3. **Movimientos de caja**: convención en DB = positivo ingreso, negativo egreso. En todos los puntos que insertan por transacción ejecutada se usa `signoCaja = (cobrador === 'pandy') ? 1 : -1` y `monto: signoCaja * monto` para que Pandy cobrando sume y Pandy pagando reste en el saldo de caja.

## Revisión de impacto (regla CC / RCA)

Antes de dar por cerrado cualquier cambio que toque **movimientos de cuenta corriente**, **flujos de ejecución** (cambiar estado, guardar transacción, sync) o **cálculo de saldo**:

1. **Verificar** que la regla conceptual se cumpla: saldo = suma de movimientos; sin doble conteo; cada movimiento por el monto realmente ejecutado.
2. **Revisar** este documento (`docs/FLUJOS_CC_REGLA.md`), `docs/REGLA_CC_SIMPLE.md` y, si existe, `docs/REGLA_CC.xlsx` (RCA = regla de cuenta corriente): que los flujos modificados sigan descritos y que no se introduzcan duplicados ni desbalances.
3. Si el saldo no cierra o hay dudas, **preguntar al usuario** antes de cerrar la tarea.

Aplicable también a movimientos de **caja** ligados a transacciones: la misma transacción debe ser la fuente de verdad del movimiento de caja y del movimiento de CC.

## Objetivo: actuar por transacción (no borrar/repoblar toda la orden)

Con la estructura actual en base de datos (movimientos con `orden_id`, `transaccion_id`, `transaccion_numero`), la regla deseable es:

- **Cada movimiento de CC (y de caja) está ligado a una transacción.** Al cambiar el estado de una transacción o al guardar una transacción, solo deben **insertarse, actualizarse o borrarse los movimientos que corresponden a esa transacción**, no borrar y volver a poblar todos los movimientos de la orden.
- **Borrar y repoblar** toda la CC (y caja) de una orden (`sincronizarCcYCajaDesdeOrden` = DELETE por `orden_id` + INSERT masivo) se vuelve **ineficiente** con alto volumen (ej. 1000 órdenes al mes): muchas filas borradas e insertadas por cada cambio de estado.
- **Implementado:** Los flujos (`cambiarEstadoTransaccion`, `saveTransaccion`, etc.) actúen siempre en función de la **transacción** conectada al movimiento: INSERT/UPDATE/DELETE solo de filas con ese `transaccion_id`, sin depender del sync completo por orden. La RPC `sync_cc_caja_orden` sigue disponible para un "Recalcular desde órdenes" explícito; el botón Refrescar solo recarga desde la base.