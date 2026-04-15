# Derivación de expectativas por combinación (CC ARS-ARS con intermediario)

Referencia: **sql/cc_modelo_reglas_todas_combinaciones.sql** (tabla `cc_modelo_reglas`).  
Montos del acuerdo: Tx1 200.000, Tx2 195.000, Tx4 197.000, Comisión Pandy 5.000, Comisión Int 3.000.

En la tabla de reglas, cada tipo de transacción tiene filas según `(estado_transaccion, contrapartida_ejecutada)`. Para Tx1 la contrapartida es Tx2; para Tx2 es Tx1; para Tx3 es Tx4; para Tx4 es Tx3. Se usa la fila donde `estado_transaccion` = estado de esa Tx y `contrapartida_ejecutada` = true si la contrapartida está en **E** (ejecutada).

**Criterios clave:**
- **Cliente – Comisión Pandy (+5k):** cuando **Tx1 o Tx2** está ejecutada (`estadoEfectivoComision` `par_cliente` = ejecutada). Con solo Tx1 E y Tx2 P: detalle **−200k** (cheque) **+5k** (comisión) → saldo neto **−195k** (= −me).
- **Comisiones al guardar la orden:** aunque el par cliente (Tx1/Tx2) o el par Pandy–intermediario (Tx3/Tx4) sigan **pendientes**, el sync CC (`aplicarMotorCcDesdeReglasDeNegocio`) **persiste** líneas de comisión en estado **`pendiente`** (plantilla de regla con `incluir_en_detalle` desde la fila canónica de par cerrado) para conciliación y detalle; al ejecutarse las patas correspondientes pasan a **`cerrado`** como antes.
- **Intermediario – signos en movimientos (CHEQUE-ARS + int):** en detalle modal se persisten **+** monto del cheque (Tx3), **−** comisión intermediario, **−** efectivo Tx4 al ejecutarse. El **saldo numérico** esperado en E2E sigue en **−197k** donde corresponde (lectura `saldoResumenANumero` con intermediario). Ver `docs/CHEQUE_ARS_INTERMEDIARIO.md`.

---

## 1. P,P,P,P

Transacciones todas pendientes: **no** hay filas CC por cobro/compromiso (lookups Tx con `incluir` en false). Sí se persisten **comisiones** en **pendiente** (spread acuerdo + comisión intermediario desde `comisiones_orden` / motor).

| Tipo        | Lookup     | cc_cliente (mov. comisión) | cc_int (mov. comisión) |
|-------------|------------|----------------------------|-------------------------|
| Tx1 / Tx2   | (P, false) | N, N                       | -                       |
| Tx3 / Tx4   | (P, false) | -                          | N, N                    |
| Com. Pandy  | pendiente  | +5.000 (pendiente)         | -                       |
| Com. Int    | pendiente  | -                          | −3.000 (pendiente)      |

- **Saldo cliente:** **+5.000** | **Detalle cliente:** **[+5.000]**
- **Saldo int:** **−3.000** | **Detalle int:** **[−3.000]**

---

## 2. P,P,P,E

Solo Tx4 ejecutada. Cliente: sin movimientos. Int: comisión y filas según reglas → saldo -197.000, detalle persistido **[+200.000, −3.000]** (cheque / comisión).

- **Saldo cliente:** **0** | **Detalle cliente:** **[]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 3. P,E,P,P

Par cliente (Tx1 P, Tx2 E): Tx2 suma +195k, Com. Pandy +5k. Par int (Tx3 P, Tx4 P): sin filas por Tx3/Tx4; **sí** comisión intermediario en **pendiente** (−3k).

- **Saldo cliente:** **200.000** (195.000 + 5.000) | **Detalle cliente:** **[195.000, 5.000]**
- **Saldo int:** **−3.000** | **Detalle int:** **[−3.000]**

---

## 4. P,E,P,E

Cliente igual que P,E,P,P. Int: detalle **[+200.000, −3.000]** → saldo -197.000.

- **Saldo cliente:** **200.000** | **Detalle cliente:** **[195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 5. E,P,P,P

**Par cliente:** Tx1 E, Tx2 P → comisión Pandy **sí** (Tx1 ejecutada). Cliente: Tx1 −200k + comisión +5k → saldo **-195.000**, detalle **[-200.000, 5.000]**. **Int:** Tx3 y Tx4 ambas P → solo comisión intermediario **pendiente** −3k.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **−3.000** | **Detalle int:** **[−3.000]**

---

## 6. E,P,P,E

Cliente: igual que E,P,P,P (−200k + 5k). Int: detalle **[+200.000, −3.000]** → saldo -197.000.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 7. E,P,E,P

Mismo criterio cliente que E,P,P,P. Int: Tx3 ejecutada + comisión → detalle **[+200.000, −3.000]**, saldo -197.000.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 8. E,P,E,E

Cliente: −195.000, [-200.000, 5.000]. Int: par cerrado → **+200k −197k −3k = 0**, detalle **[200.000, −197.000, −3.000]**.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[200.000, −197.000, −3.000]**

---

## 9. E,E,P,P

Par cliente ejecutado → -200k + 195k + 5k = 0, detalle [-200.000, 195.000, 5.000]. **Int:** Tx3 y Tx4 ambas P → comisión intermediario **pendiente** −3k.

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **−3.000** | **Detalle int:** **[−3.000]**

---

## 10. E,E,P,E

Cliente: 0, [-200.000, 195.000, 5.000]. Int: -197.000, detalle **[200.000, −3.000]**.

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 11. E,E,E,P

Cliente: 0, [-200.000, 195.000, 5.000]. Int: -197.000, detalle **[200.000, −3.000]**.

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[200.000, −3.000]**

---

## 12. E,E,E,E

Todo ejecutado. Cliente: 0, [-200.000, 195.000, 5.000]. Int: 0, detalle **[200.000, −197.000, −3.000]**.

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[200.000, −197.000, −3.000]**

---

## Resumen tabla esperado (12 combinaciones)

| Combinación | Saldo Cliente | Saldo Int | Detalle Cliente              | Detalle Int                |
|-------------|---------------|-----------|------------------------------|----------------------------|
| P,P,P,P     | 5.000         | −3.000    | [5.000]                      | [−3.000]                   |
| P,P,P,E     | 0             | -197.000  | []                           | [200.000, −3.000]          |
| P,E,P,P     | 200.000       | −3.000    | [195.000, 5.000]             | [−3.000]                   |
| P,E,P,E     | 200.000       | -197.000  | [195.000, 5.000]             | [200.000, −3.000]          |
| E,P,P,P     | -195.000      | −3.000    | [-200.000, 5.000]            | [−3.000]                   |
| E,P,P,E     | -195.000      | -197.000  | [-200.000, 5.000]            | [200.000, −3.000]          |
| E,P,E,P     | -195.000      | -197.000  | [-200.000, 5.000]            | [200.000, −3.000]          |
| E,P,E,E     | -195.000      | 0         | [-200.000, 5.000]            | [200.000, −197.000, −3.000] |
| E,E,P,P     | 0             | −3.000    | [-200.000, 195.000, 5.000]   | [−3.000]                   |
| E,E,P,E     | 0             | -197.000  | [-200.000, 195.000, 5.000]   | [200.000, −3.000]          |
| E,E,E,P     | 0             | -197.000  | [-200.000, 195.000, 5.000]   | [200.000, −3.000]          |
| E,E,E,E     | 0             | 0         | [-200.000, 195.000, 5.000]   | [200.000, −197.000, −3.000] |

- **Intermediario saldo 0 y detalle [] (solo patas Tx3/Tx4):** cuando Tx3 y Tx4 están **ambas P** no hay movimientos de **pago/cobro** del circuito int.; **sí** puede figurar la **comisión** intermediario en **pendiente** (−3k) salvo que otras patas ya hayan absorbido el mismo criterio en el detalle final (combinaciones con más Tx ejecutadas).
- **Cliente con Tx1 ejecutada y Tx2 pendiente (E,P,*,*):** saldo **−195.000** (200k nominal − comisión Pandy 5k); detalle **[-200.000, 5.000]** (cobro nominal + línea de comisión).

Este documento es la fuente para auditar **tests/e2e/cc-combinaciones-esperado.js** y el log Excel del test E2E.
