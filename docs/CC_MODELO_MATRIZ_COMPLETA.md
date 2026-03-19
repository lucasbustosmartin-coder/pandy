# Matriz completa de reglas CC (derivada del Excel CC_MODELO.xlsx)

Cada **tipo de transacción** (pagador, cobrador, tipo_transaccion, es_comision) tiene **siempre 4 filas** en la tabla, una por cada par **(estado_transaccion, contrapartida_ejecutada)**. Así se cubren **todas** las situaciones posibles de una orden (cualquier combinación de qué transacciones están ejecutadas o pendientes).

Referencia: **docs/CC_MODELO_REFERENCIA.md** (Reglas 1 a 4 del Excel).

---

## Convención

- **estado_transaccion**: estado de ESA transacción (pendiente / ejecutada).
- **contrapartida_ejecutada**: true si la otra pata del par está ejecutada (ej. para Tx1 la contrapartida es Tx2; para Tx3 es Tx4).
- **cc_cliente_signo** / **cc_intermediario_signo**: multiplicador del monto (-1, 0, 1). En DB guardamos el signo; monto_final = signo × monto.
- **suma_saldo**: si esa fila aporta al saldo. Según modelo: pendientes no suman (N); solo ejecutadas con incluir Y generan detalle (solo una por par puede ser Y: la “contrapartida pendiente” cuando la otra está ejecutada).
- **incluir_en_mov**: si se crea fila en el detalle de movimientos. Según modelo: **pendiente = N** (no se incluye en detalle); solo las ejecutadas con incluir Y aparecen.

---

## Con intermediario (4 transacciones + 2 comisiones)

Tipos: Tx1, Tx2, Tx3, Tx4, Comisión Pandy, Comisión Intermediario.

### Tx1 – Cliente → Pandy, ingreso (no comisión)

| estado_transaccion | contrapartida_ejecutada | cc_cliente_signo | cc_cliente_suma_saldo | incluir_en_mov_cc_cliente | cc_intermediario_* | concepto_leyenda |
|-------------------|-------------------------|------------------|----------------------|---------------------------|--------------------|------------------|
| ejecutada         | false                   | -1               | **Y**                 | Y                         | 0, N, N            | cobro_realizado  |
| ejecutada         | true                    | -1               | **Y**                 | **N**                     | 0, N, N            | cobro_realizado  |
| pendiente         | false                   | 0                | N                     | N                         | 0, N, N            | —                |
| pendiente         | true                    | -1               | **Y**                 | N                         | 0, N, N            | —                |

*Modelo imagen: par cerrado (E,true) → SUMA_SALDO Y, INCLUIR N (cobro -200k aporta al saldo pero no va solo al detalle; el detalle muestra la otra pata). Sync escribe cuando INCLUIR O SUMA_SALDO para que suma(detalle) = saldo.*

---

### Tx2 – Pandy → Cliente, egreso (no comisión)

| estado_transaccion | contrapartida_ejecutada | cc_cliente_signo | cc_cliente_suma_saldo | incluir_en_mov_cc_cliente | cc_intermediario_* | concepto_leyenda |
|-------------------|-------------------------|------------------|----------------------|---------------------------|--------------------|------------------|
| ejecutada         | false                   | 1                | **Y**                 | Y                         | 0, N, N            | compromiso_pago  |
| ejecutada         | true                    | 1                | **N**                 | Y                         | 0, N, N            | compromiso_pago  |
| pendiente         | false                   | 0                | N                     | N                         | 0, N, N            | —                |
| pendiente         | true                    | 1                | N                     | N                         | 0, N, N            | —                |

*Modelo imagen: par cerrado (E,true) → SUMA_SALDO N, INCLUIR Y (compromiso +195k se muestra en detalle; no suma al saldo porque ya sumó Tx1).*

---

### Tx3 – Pandy → Intermediario, egreso (no comisión)

| estado_transaccion | contrapartida_ejecutada | cc_cliente_* | cc_intermediario_signo | cc_intermediario_suma_saldo | incluir_en_mov_cc_intermediario | concepto_leyenda |
|-------------------|-------------------------|--------------|-------------------------|-----------------------------|----------------------------------|------------------|
| ejecutada         | false                   | 0, N, N      | 1                       | N                           | Y                                | pago_realizado   |
| ejecutada         | true                    | 0, N, N      | 1                       | N                           | Y                                | pago_realizado   |
| pendiente         | false                   | 0, N, N      | 0                       | N                           | N                                | —                |
| pendiente         | true                    | 0, N, N      | **-1**                  | **Y**                       | **N**                            | —                |

*Modelo imagen: Tx3 pendiente con Tx4 ejecutada → signo -1 (CC int -200k), SUMA_SALDO Y, INCLUIR N. Ejecutada → +200k, INCLUIR Y.*

---

### Tx4 – Intermediario → Pandy, ingreso (no comisión)

| estado_transaccion | contrapartida_ejecutada | cc_cliente_* | cc_intermediario_signo | cc_intermediario_suma_saldo | incluir_en_mov_cc_intermediario | usa_monto_efectivo | concepto_leyenda |
|-------------------|-------------------------|--------------|-------------------------|-----------------------------|----------------------------------|--------------------|------------------|
| ejecutada         | false                   | 0, N, N      | -1                      | N                           | Y                                | Y (197k)           | cobro_realizado  |
| ejecutada         | true                    | 0, N, N      | -1                      | N                           | Y                                | Y                  | cobro_realizado  |
| pendiente         | false                   | 0, N, N      | 0                       | N                           | N                                | Y                  | —                |
| pendiente         | true                    | 0, N, N      | -1                      | **Y**                       | N                                | Y                  | —                |

*Modelo imagen: Tx4 ejecutada (par cerrado) → SUMA_SALDO N, INCLUIR Y (-197k en detalle). Tx4 pendiente con Tx3 ejecutada → SUMA_SALDO Y, INCLUIR N.*

---

### Comisión Pandy – Cliente → Pandy, ingreso, es_comision = true

| estado_transaccion | contrapartida_ejecutada | cc_cliente_signo | cc_cliente_suma_saldo | incluir_en_mov_cc_cliente | cc_intermediario_* | concepto_leyenda |
|-------------------|-------------------------|------------------|----------------------|---------------------------|--------------------|------------------|
| ejecutada         | false                   | **+1**           | N                    | Y                         | 0, N, N            | comision_acuerdo |
| ejecutada         | true                    | **+1**           | N                    | **Y**                     | 0, N, N            | comision_acuerdo |
| pendiente         | false                   | **+1**           | N                    | **Y**                     | 0, N, N            | —                |
| pendiente         | true                    | **+1**           | N                    | **Y**                     | 0, N, N            | —                |

*Comisión siempre INCLUIR en detalle (ejecutada y pendiente, par cerrado o no) para que detalle = saldo: -200k+195k+5k=0.*

---

### Comisión Intermediario – Pandy → Intermediario, egreso, es_comision = true

| estado_transaccion | contrapartida_ejecutada | cc_cliente_* | cc_intermediario_signo | cc_intermediario_suma_saldo | incluir_en_mov_cc_intermediario | condicion_estado_comision |
|-------------------|-------------------------|--------------|-------------------------|-----------------------------|----------------------------------|---------------------------|
| ejecutada         | false                   | 0, N, N      | -1                      | N                           | Y                                | par_pandy_int             |
| ejecutada         | true                    | 0, N, N      | -1                      | N                           | Y                                | par_pandy_int             |
| pendiente         | false                   | 0, N, N      | **-1**                   | N                           | **Y**                                | par_pandy_int             |
| pendiente         | true                    | 0, N, N      | **-1**                   | N                           | **Y**                                | par_pandy_int             |

*Modelo: comisión pendiente → INCLUIR Y, signo - (CC int -3.000). Estado efectivo: ejecutada si Tx3 o Tx4 ejecutada.*

---

## Sin intermediario (2 transacciones)

Tipos: Tx1 (Cliente→Pandy ingreso), Tx2 (Pandy→Cliente egreso). Misma lógica de signos y suma_saldo que el par cliente en ARS-ARS. CC intermediario no aplica (0, N, N en todas).

### Cliente → Pandy, ingreso (no comisión)

Igual que Tx1 con intermediario: 4 filas con (-1, N, Y), (-1, N, Y), (0, N, N), (-1, N, N) en (pendiente, true).

### Pandy → Cliente, egreso (no comisión)

Igual que Tx2 con intermediario: 4 filas con (1, N, Y), (1, N, Y), (0, N, N), (1, N, N) en la última (pendiente+contrapartida true: no suma, no incluir).

---

## Resumen de “todas las combinaciones”

- **Por tipo de operación y si usa intermediario:** se definen los “tipos de transacción” (2 sin int, 6 con int).
- **Por cada tipo de transacción:** siempre **4 filas** (estado = ejecutada/pendiente × contrapartida_ejecutada = false/true).
- Con eso la app tiene **una regla para cada situación posible** al hacer lookup(reglas, pagador, cobrador, tipo, es_comision, estado_transaccion, contrapartida_ejecutada).

**Sync:** se escribe movimiento cuando INCLUIR Y o SUMA_SALDO Y. **Contribución:** contribucionSaldoIntermediarioModeloCc incluye Tx3 pendiente + Tx4 ejecutada → -200k. Script SQL: **sql/cc_modelo_reglas_todas_combinaciones.sql**.
