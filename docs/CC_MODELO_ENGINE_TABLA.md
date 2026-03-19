# Motor de CC impulsado por la tabla `cc_modelo_reglas`

La lógica de cuenta corriente (qué movimientos crear, signos, qué suma al saldo) debe **salir de la tabla** `cc_modelo_reglas`, no de reglas fijas en el front. Así el sistema es **indiferente al tipo de operación**: si mañana se agrega USD-ARS con intermediario, solo se cargan filas en la tabla y el mismo motor aplica.

---

## Principio

1. **Fuente de verdad:** tabla `cc_modelo_reglas` (por `tipo_operacion_codigo`, `usa_intermediario`, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada).
2. **Moneda y monto de exposición (opcional, por fila):** columnas `cc_cliente_moneda_exposicion`, `cc_cliente_monto_referencia`, `cc_intermediario_moneda_exposicion`, `cc_intermediario_monto_referencia`. Valores de moneda: `orden_recibida`, `orden_entregada`, `transaccion`. Valores de monto: `mr`, `me`, `monto_transaccion`, y para intermediario además `monto_efectivo_intermediario`. Si **ambas** columnas de un lado son `NULL`, el motor usa la **lógica legacy** (p. ej. ingreso Cliente→Pandy en moneda recibida y `mr`). En tipos **sin intermediario**: **ARS-USD y USD-ARS** usan por defecto **ingreso** Cliente→Pandy = `orden_entregada` + `me`; en **USD-USD** el ingreso usa `transaccion` + `monto_transaccion` (cobro bruto). En todos, **egreso** Pandy→Cliente = `transaccion` + `monto_transaccion` (`sql/cc_modelo_reglas_tabla.sql`, `sql/cc_modelo_reglas_todas_combinaciones.sql` §2, `sql/migracion_cc_modelo_reglas_moneda_exposicion.sql`). **Excepciones (fuente de verdad en tabla):** (a) fila **ingreso**, `estado_transaccion = pendiente`, `contrapartida_ejecutada = true` (ej. Tx2 ejecutada, Tx1 pendiente) → `orden_recibida` + `mr`, concepto `compromiso_cobrar`, suma saldo e incluye movimiento; (b) en USD-USD, comisión ejecutada con par cliente cerrado (`ejecutada` + `contrapartida_ejecutada = true`) suma saldo para cerrar con cobro bruto y egreso. Migraciones puntuales: `sql/migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql` y `sql/migracion_cc_modelo_reglas_usd_usd_cobro_bruto_y_cierre_comision.sql`.
3. **Motor genérico:** dado una orden y sus transacciones (y comisiones), el front:
   - Obtiene `codigo` y `usa_intermediario` de la orden.
   - Carga reglas: `reglas = getReglasCcModelo(codigo, usa_intermediario)`.
   - Si **no hay reglas** → fallback al comportamiento actual.
   - Si **hay reglas** → para cada transacción y cada comisión deriva (estado, contrapartida), **busca la fila** en reglas y aplica **solo lo que diga la tabla**: crea movimiento en CC cuando `regla.incluir_en_mov_cc_cliente` o `regla.incluir_en_mov_cc_intermediario` es true (o cuando suma al saldo). No se agregan condiciones ad-hoc en el front; la tabla define qué aparece en el listado de Movimientos. En tipos **sin intermediario**, con par cliente cerrado el ingreso Cliente→Pandy debe llevar `incluir_en_mov_cc_cliente = true` para que se vea **Cobro Realizado** junto al egreso y la comisión (`sql/migracion_cc_modelo_reglas_sin_int_incluir_cobro_par_cerrado.sql`).

4. **Comisiones sin transacción propia:** la tabla tiene `condicion_estado_comision`. El motor (`estadoEfectivoComision`) interpreta el nombre y devuelve estado efectivo (ejecutada/pendiente). Condiciones: `par_pandy_int` = ejecutada si Tx3 o Tx4 ejecutada (Comisión Intermediario); `par_cliente` = ejecutada si par cerrado (Tx1 y Tx2) O Tx2 ejecutada (Comisión Pandy; así P,E,P,P da saldo 200k y detalle 195k+5k). Con eso se hace lookup y se incluye o no el movimiento.

---

## Flujo del motor (sync CC)

1. Cargar reglas: `select * from cc_modelo_reglas where tipo_operacion_codigo = ? and usa_intermediario = ?`.
2. **Por cada transacción** `t`:
   - `estado` = t.estado (pendiente/ejecutada).
   - `contrapartida_ejecutada` = la otra pata del par (cliente↔pandy o pandy↔intermediario) está ejecutada.
   - `regla = lookupRegla(reglas, t.pagador, t.cobrador, t.tipo, false, estado, contrapartida_ejecutada)`.
   - Si regla e `incluir_en_mov_cc_cliente` → agregar fila CC cliente (monto = signo × base; base y moneda según `cc_cliente_moneda_exposicion` / `cc_cliente_monto_referencia` o legacy; intermediario análogo con `cc_intermediario_*` y `usa_monto_efectivo`).
   - Si regla e `incluir_en_mov_cc_intermediario` → agregar fila CC intermediario.
3. **Por comisión Pandy:** se obtiene `condicion_estado_comision` de la tabla (ej. `par_cliente`). estado_efectivo = estadoEfectivoComision(transacciones, condicion); si no hay condición, fallback par cerrado. regla = lookup(reglas, cliente, pandy, ingreso, true, estado_efectivo, parClienteCerrado). Si regla.incluir o suma_saldo → agregar fila.
4. **Por comisión Intermediario:** igual: condicion = getCondicionComision(reglas, pandy, intermediario, egreso) (ej. `par_pandy_int`). estado_efectivo = estadoEfectivoComision(transacciones, condicion). lookup(reglas, pandy, intermediario, egreso, true, estado_efectivo, parIntCerrado). Si incluir o suma_saldo → agregar fila.
5. **Cierre sintético “Cierre orden” (dos monedas, sin intermediario):** solo se aplica si **ninguna** fila de reglas para ese tipo tiene `cc_cliente_moneda_exposicion` ni `cc_cliente_monto_referencia` definidos. Si la tabla usa exposición, el motor ya cierra en una moneda y ese cierre legacy rompería el saldo (duplicaría ARS + USD).
6. Caja se sigue armando por transacción ejecutada (no depende de exposición CC).
7. **Detalle vs exposición (sin intermediario, dos monedas):** el movimiento que suma al saldo usa `cc_cliente_moneda_exposicion` (p. ej. USD + `me`). Si esa moneda **no** es la de la transacción de ingreso Cliente→Pandy, el motor agrega una **línea espejo** en la moneda de la transacción (`monto_transaccion`, mismo signo/concepto) con `sumar_al_saldo = false` e `incluir_en_detalle = true`, para que el listado muestre el cobro en ARS (o la moneda real) sin romper el saldo en la moneda de exposición. Cuando el egreso Pandy→Cliente está ejecutado y la transacción es en la moneda **entregada** del acuerdo, se agrega una **línea espejo** en la moneda **recibida** (`mr`, mismo concepto Compromiso) ligada al `transaccion_id` del egreso (`sumar_al_saldo = false`), para que en Movimientos el Originante sea Pandy y la columna de la otra moneda quede compensada con el espejo del ingreso. El egreso con par cerrado (`ejecutada` + contrapartida ejecutada) debe tener `cc_cliente_suma_saldo = true` en la regla principal para compensar el ingreso en el resumen.

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
- Moneda/monto exposición: `sql/migracion_cc_modelo_reglas_moneda_exposicion.sql` (proyectos existentes; no pisa la excepción pendiente+contrapartida en ingreso).
- Ingreso pendiente + contrapartida ejecutada (P,E): `sql/migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql`.
- Condición comisión: `sql/migracion_cc_modelo_reglas_condicion_comision.sql`.
- Detalle solo cuando corresponde (par cerrado = sin movimientos): `sql/migracion_cc_modelo_reglas_incluir_solo_si_suma_saldo.sql` (actualiza incluir_en_mov en la tabla).
- Motor en front: `main.js` (getReglasCcModelo, lookupRegla, contrapartidaEjecutada, estadoEfectivoComision; sincronizarCcYCajaDesdeOrden solo lee la tabla).
