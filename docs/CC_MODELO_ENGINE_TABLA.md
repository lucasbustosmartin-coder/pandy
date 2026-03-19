# Motor de CC impulsado por la tabla `cc_modelo_reglas`

La lógica de cuenta corriente (qué movimientos crear, signos, qué suma al saldo) debe **salir de la tabla** `cc_modelo_reglas`, no de reglas fijas en el front. Así el sistema es **indiferente al tipo de operación**: si mañana se agrega USD-ARS con intermediario, solo se cargan filas en la tabla y el mismo motor aplica.

---

## Principio

1. **Fuente de verdad:** tabla `cc_modelo_reglas` (por `tipo_operacion_codigo`, `usa_intermediario`, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada).
2. **Motor genérico:** dado una orden y sus transacciones (y comisiones), el front:
   - Obtiene `codigo` y `usa_intermediario` de la orden.
   - Carga reglas: `reglas = getReglasCcModelo(codigo, usa_intermediario)`.
   - Si **no hay reglas** → fallback al comportamiento actual.
   - Si **hay reglas** → para cada transacción y cada comisión deriva (estado, contrapartida), **busca la fila** en reglas y aplica **solo lo que diga la tabla**: crea movimiento en CC cuando `regla.incluir_en_mov_cc_cliente` o `regla.incluir_en_mov_cc_intermediario` es true. No se agregan condiciones ad-hoc en el front; la tabla define cuándo hay detalle vacío (p. ej. par cerrado = filas con incluir = false).

3. **Comisiones sin transacción propia:** la tabla tiene `condicion_estado_comision`. El motor (`estadoEfectivoComision`) interpreta el nombre y devuelve estado efectivo (ejecutada/pendiente). Condiciones: `par_pandy_int` = ejecutada si Tx3 o Tx4 ejecutada (Comisión Intermediario); `par_cliente` = ejecutada si par cerrado (Tx1 y Tx2) O Tx2 ejecutada (Comisión Pandy; así P,E,P,P da saldo 200k y detalle 195k+5k). Con eso se hace lookup y se incluye o no el movimiento.

---

## Flujo del motor (sync CC)

1. Cargar reglas: `select * from cc_modelo_reglas where tipo_operacion_codigo = ? and usa_intermediario = ?`.
2. **Por cada transacción** `t`:
   - `estado` = t.estado (pendiente/ejecutada).
   - `contrapartida_ejecutada` = la otra pata del par (cliente↔pandy o pandy↔intermediario) está ejecutada.
   - `regla = lookupRegla(reglas, t.pagador, t.cobrador, t.tipo, false, estado, contrapartida_ejecutada)`.
   - Si regla e `incluir_en_mov_cc_cliente` → agregar fila CC cliente (monto = signo × monto; si regla.usa_monto_efectivo usar monto efectivo).
   - Si regla e `incluir_en_mov_cc_intermediario` → agregar fila CC intermediario.
3. **Por comisión Pandy:** se obtiene `condicion_estado_comision` de la tabla (ej. `par_cliente`). estado_efectivo = estadoEfectivoComision(transacciones, condicion); si no hay condición, fallback par cerrado. regla = lookup(reglas, cliente, pandy, ingreso, true, estado_efectivo, parClienteCerrado). Si regla.incluir o suma_saldo → agregar fila.
4. **Por comisión Intermediario:** igual: condicion = getCondicionComision(reglas, pandy, intermediario, egreso) (ej. `par_pandy_int`). estado_efectivo = estadoEfectivoComision(transacciones, condicion). lookup(reglas, pandy, intermediario, egreso, true, estado_efectivo, parIntCerrado). Si incluir o suma_saldo → agregar fila.
5. Caja y cierre dos monedas se mantienen como están (no dependen del modelo por tipo).

---

## Saldo (resumen CC)

Con reglas cargadas: para cada orden con transacciones, por cada regla con `cc_cliente_suma_saldo` o `cc_intermediario_suma_saldo` = true, comprobar si el estado actual de la orden (qué transacciones están ejecutadas/pendientes) coincide con (estado_transaccion, contrapartida_ejecutada) de esa regla; si coincide, sumar al saldo `signo × monto` (monto de la transacción o monto efectivo según regla).

---

## Ventajas

- **Un solo lugar:** cambiar signos o incluir/suma_saldo solo tocando la tabla.
- **Indiferente al tipo de operación:** ARS-ARS, ARS-ARS-CHEQUE, y futuros tipos; si tienen filas en la tabla, el motor aplica.
- **Sin reglas:** si no hay filas para ese (codigo, usa_intermediario), el front usa el fallback actual (no rompe órdenes sin modelo).

---

## Archivos

- Tabla y datos: `sql/cc_modelo_reglas_tabla.sql`.
- Condición comisión: `sql/migracion_cc_modelo_reglas_condicion_comision.sql`.
- Detalle solo cuando corresponde (par cerrado = sin movimientos): `sql/migracion_cc_modelo_reglas_incluir_solo_si_suma_saldo.sql` (actualiza incluir_en_mov en la tabla).
- Motor en front: `main.js` (getReglasCcModelo, lookupRegla, contrapartidaEjecutada, estadoEfectivoComision; sincronizarCcYCajaDesdeOrden solo lee la tabla).
