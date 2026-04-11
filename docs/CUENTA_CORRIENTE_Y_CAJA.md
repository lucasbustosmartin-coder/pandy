# Cuenta corriente y Caja/Bancos: cuándo se registran movimientos

## Regla de negocio

- **Cuenta corriente (cliente e intermediario):** debe reflejar **todos** los movimientos en **cualquier** estado de la transacción (pendiente y ejecutada). La CC muestra la situación real de lo que se debe/cobra con cada parte a medida que se instrumenta y ejecuta.
- **Caja y Bancos:** solo se impactan cuando la transacción está en estado **ejecutada**. El efectivo/banco de Pandy solo se mueve cuando la operación se ejecuta.

## Momentos en que se registran movimientos

### Apertura de la vista Cuenta corriente (con conexión)

Con red, al **entrar** al menú **Cuenta corriente** (carga visible, no el refresco silencioso en segundo plano), la app ejecuta primero el **alineado global** de CC y caja por cada orden con instrumentación (`sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion`: varias órdenes en **paralelo por lotes**, una sola corrida compartida si otra vista ya disparó el mismo sync, y **cooldown** en sesión para no repetir al reabrir el menú en menos de ~1 min si el último sync global fue exitoso) y **después** lee movimientos y pinta saldos y tablas. Así no se muestran cifras basadas en movimientos de BD aún no regenerados por ese sync. El botón **Refrescar** fuerza de nuevo el sync global completo. El refresco automático periódico de CC sigue siendo **solo lectura** (`SELECT`), sin repetir el sync global, para evitar parpadeos y condiciones de carrera.

### Cuenta corriente (movimientos_cuenta_corriente y movimientos_cuenta_corriente_intermediario)

La **fuente de verdad** es el sync por orden: `sincronizarCcYCajaDesdeOrden` borra los movimientos derivados de esa orden y los vuelve a armar desde las transacciones vigentes.

**Columna «Usuario» (auditoría):** cada movimiento derivado debe llevar el **`usuario_id` de quien ejecutó o grabó la transacción** de referencia (`transacciones.usuario_id`), con fallback al creador de la orden (`ordenes.usuario_id`) en líneas sintéticas. No debe usarse la sesión de quien solo abre la pantalla o pulsa **Refrescar** en CC: el motor `aplicarMotorCcDesdeReglasDeNegocio` y el armado de filas legacy/multicontraparte siguen esa regla; la RPC `sync_cc_caja_orden` en Supabase complementa resolviendo `usuario_id` desde `transacciones`/`ordenes` si el JSON llegara incompleto (`sql/rpc_sync_cc_caja_orden.sql`).

1. **Momento 0:** en cuanto existe una transacción **pendiente** guardada, el sync debe generar las filas CC que correspondan (columna `estado` del movimiento = **`pendiente`** o **`cerrado`** alineada al estado de la transacción; leyendas según motor `reglas_de_negocio`, multicontraparte manual o legacy). **Multicontraparte manual** ya no exige “al menos una ejecutada” para empezar a reflejar CC del acuerdo.
2. **Al guardar o editar una transacción** (`saveTransaccion`) y al **cambiar el estado** (`cambiarEstadoTransaccion`): tras persistir, se encadena el sync de la orden; la CC se recalcula completa para esa orden.
3. **Tipos con motor** (`reglas_de_negocio`): el motor aplica también transacciones pendientes; si falta fila en la tabla, puede no generarse movimiento hasta completar reglas o fallback documentado.
4. **Legacy** (sin motor en ese tipo) y **CHEQUE-ARS con intermediario**: mismas patas en **pendiente** o **ejecutada** con `estado` de fila coherente.
5. **Al eliminar una transacción** (dar de baja): el sync deja de incluir esa transacción (y se eliminan movimientos al reescribir la orden).
6. **Movimientos de cierre por orden ejecutada** (`generarMovimientoConversionCc`, …): cuando la orden pasa a "orden_ejecutada", movimientos adicionales según reglas vigentes. Solo consideran transacciones ejecutadas donde aplique.

**Resumen CC (grilla Saldos):** la exposición por transacciones **pendientes** del cliente en **misma moneda** (USD-USD, etc.) queda en las **filas CC `pendiente`** tras el sync; ya no se suma un ajuste sintético paralelo en `contribucionPendienteCcUnificada` para ese caso (sigue el ajuste **intermediario** Pandy→Intermediario pendiente donde el modelo CHEQUE aún no generó fila CC).

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

### Tarjetas de saldo en la app (Resumen, modal, totales)

- En **Saldos** (grilla por cliente/intermediario), en el **modal «Detalle de movimientos»** (tarjetas USD/ARS/EUR arriba) y en los **totales** de la pestaña **Movimientos** de CC, el importe por moneda es la **suma algebraica de movimientos no anulados** (incluye **`pendiente`** y **`cerrado`**). Solo **`anulado`** queda fuera del saldo (sigue visible en tablas). Las monedas con líneas pendientes se marcan aparte (`pendienteEnMoneda` / leyendas de clase de pendiente). En el **modal detalle**, bajo cada tarjeta puede mostrarse el **subtotal «Saldo pendiente»** (solo filas `pendiente`) y la tabla de movimientos tiene un pie con el mismo subtotal. Implementación: `ccMovimientoIncluirEnSaldoResumen` y `saldosPendiente` en `continuarFetchMovimientosCcCore` / `htmlCcModalSaldosCards` en `main.js`.
- En la solapa **Saldos**, la grilla admite **filtrar por nombre** (texto contenido en el nombre del cliente o intermediario según el Tipo). Los totales de la cabecera y la **exportación a Excel** usan **las mismas filas visibles** que la tabla; el Excel incluye las filas de metadatos de auditoría estándar (`metaFilasExportacionExcel`) y los importes por moneda como valores numéricos.

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

Implementación: `main.js` (`sincronizarCcYCajaDesdeOrden`, saveTransaccion, cambiarEstadoTransaccion, `aplicarCcMulticontraparteManualConciliacionCompleta`, `aplicarMotorCcDesdeReglasDeNegocio`, autoCompletarInstrumentacion*, eliminarTransaccion, generarMovimientoConversionCc*).

**Intermediario y cliente como la misma persona:** la tabla `contraparte_vinculo` declara el vínculo 1:1; se gestiona desde **Clientes** e **Intermediarios** (editar registro). En **Cuenta corriente**, con el filtro **Cliente** solo se muestran movimientos y saldos de `movimientos_cuenta_corriente` de ese cliente (la CC “pura” del rol cliente). Con el filtro **Intermediario**, la fila y el detalle de ese intermediario **suman y listan** también los movimientos de `movimientos_cuenta_corriente` del cliente vinculado, además de `movimientos_cuenta_corriente_intermediario` — **solo lectura en pantalla**; la persistencia y el sync no mezclan tablas. En **órdenes**, no se puede guardar la misma fila con ese `cliente_id` y ese `intermediario_id` a la vez (regla Fase 4; trigger en BD). Ver `docs/PLAN_INTERMEDIARIO_CLIENTE_CC_UNIFICADA.md`.
