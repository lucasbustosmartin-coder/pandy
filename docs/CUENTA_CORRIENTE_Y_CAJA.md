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

### Auditoría en SQL (¿faltan movimientos CC?)

En Supabase SQL Editor se puede ejecutar **`sql/auditoria_cc_transacciones_y_ordenes.sql`** (consultas **1**, **1b**, 2–5, **3b**, **5a** y la **§6** de diagnóstico por `orden_id`: tipo de operación, multicontraparte manual y conteos de `reglas_de_negocio`). Incluye, entre otras:

1. Transacciones en **pendiente** o **ejecutada** sin ninguna fila en `movimientos_cuenta_corriente` ni en `movimientos_cuenta_corriente_intermediario` (mismo `transaccion_id`), con **tipo de operación**, **pagador/cobrador**, moneda, monto y prefijo de concepto (para cruzar con `reglas_de_negocio` y con la instrumentación en la app).
1b. Mismo criterio que (1) pero **solo** si la orden **ya tiene** al menos un movimiento CC en algún libro (hueco **parcial**: conviene abrir la orden, revisar la pata y el sync; tras actualizar el front, **Refrescar** en Cuenta corriente reintenta persistir).
2. Órdenes con al menos una transacción no anulada y **cero** filas CC en **ambos** libros (candidatas a que el sync nunca persistió nada para esa orden).
3. Incoherencias entre orden/transacción **anulada** y movimientos CC que siguen sin estado anulado (revisar en tu BD si el movimiento usa `anulado` u `anulada` según migraciones).
3b. Órdenes en estado **anulada** con al menos una transacción pero **cero** filas CC en cliente e intermediario (legado antes de que el flujo «Anular orden» siempre sincronizara; corregir con **Refrescar** en Cuenta corriente o sync por orden).
4. Resumen por orden (§5): conteos de transacciones por estado vs filas CC.
5. Igual que (4) pero **solo órdenes no anuladas** (§5a): vista «solo vigentes» sin mezclar anuladas en el mismo listado.

Los resultados pueden incluir **falsos positivos** si una transacción concreta, por reglas de negocio, no debe generar CC en ningún libro; sirven como lista corta para revisar orden por orden en la app o forzar **Refrescar** en Cuenta corriente y volver a consultar.

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
| **Anular orden** | Siempre sync por orden: CC derivada regenerada; filas con transacción anulada en **anulado** (visibles, fuera del saldo) | Caja derivada solo por transacciones que estuvieron ejecutadas |

Implementación: `main.js` (`sincronizarCcYCajaDesdeOrden`, saveTransaccion, cambiarEstadoTransaccion, `aplicarCcMulticontraparteManualConciliacionCompleta`, `aplicarMotorCcDesdeReglasDeNegocio`, autoCompletarInstrumentacion*, eliminarTransaccion, generarMovimientoConversionCc*, `ejecutarAnulacionOrdenCompleta`).

**Intermediario y cliente como la misma persona:** la tabla `contraparte_vinculo` declara el vínculo 1:1; se gestiona desde **Clientes** e **Intermediarios** (editar registro). En **Cuenta corriente**, con el filtro **Cliente** solo se muestran movimientos y saldos de `movimientos_cuenta_corriente` de ese cliente (la CC “pura” del rol cliente). Con el filtro **Intermediario**, la fila y el detalle de ese intermediario **suman y listan** también los movimientos de `movimientos_cuenta_corriente` del cliente vinculado, además de `movimientos_cuenta_corriente_intermediario` — **solo lectura en pantalla**; la persistencia y el sync no mezclan tablas. Con el filtro **Total** (Saldos y Movimientos), la grilla de saldos muestra cada posición económica **una sola vez**: filas intermediario (con la misma fusión que en Intermediario) más filas cliente **sin** vínculo; los clientes vinculados no se suman otra vez en su fila cliente. En Movimientos, el listado incluye todos los movimientos del detalle plano (sin duplicar filas); el combo por entidad distingue posición consolidada (`i:…`) vs cliente solo (`c:…`). En **órdenes**, sí puede guardarse el mismo par `cliente_id` / `intermediario_id` del vínculo en una orden cuando el tipo lo requiere; si la base aún tiene el trigger antiguo de la Fase 4, aplicar `sql/migracion_ordenes_quitar_trigger_par_vinculado.sql`. Ver `docs/PLAN_INTERMEDIARIO_CLIENTE_CC_UNIFICADA.md`.
