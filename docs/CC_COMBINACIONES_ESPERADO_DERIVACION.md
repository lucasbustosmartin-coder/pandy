# Derivación de expectativas por combinación (CC ARS-ARS con intermediario)

Referencia: **sql/cc_modelo_reglas_todas_combinaciones.sql** (tabla `cc_modelo_reglas`).  
Montos del acuerdo: Tx1 200.000, Tx2 195.000, Tx4 197.000, Comisión Pandy 5.000, Comisión Int 3.000.

En la tabla de reglas, cada tipo de transacción tiene filas según `(estado_transaccion, contrapartida_ejecutada)`. Para Tx1 la contrapartida es Tx2; para Tx2 es Tx1; para Tx3 es Tx4; para Tx4 es Tx3. Se usa la fila donde `estado_transaccion` = estado de esa Tx y `contrapartida_ejecutada` = true si la contrapartida está en **E** (ejecutada).

**Criterios clave:**
- **Cliente – Comisión Pandy (+5k):** cuando **Tx1 o Tx2** está ejecutada (`estadoEfectivoComision` `par_cliente` = ejecutada). Con solo Tx1 E y Tx2 P: detalle **−200k** (cheque) **+5k** (comisión) → saldo neto **−195k** (= −me).
- **Intermediario – saldo 0:** cuando Tx3 y Tx4 están **ambas P**, las reglas tienen `suma_saldo` e `incluir` en false para esas filas → no se escribe ningún movimiento → saldo int **0**, detalle int **[]**.

---

## 1. P,P,P,P

Todo pendiente = nadie le debe a nadie.

| Tipo        | Lookup     | cc_cliente (suma_saldo, incluir) | cc_int |
|-------------|------------|----------------------------------|--------|
| Tx1 / Tx2   | (P, false) | N, N                              | -      |
| Tx3 / Tx4   | (P, false) | -                                 | N, N   |
| Com. Pandy  | (P, false) | N, N                              | -      |
| Com. Int    | (P, false) | -                                 | N, N   |

- **Saldo cliente:** **0** | **Detalle cliente:** **[]**
- **Saldo int:** **0** | **Detalle int:** **[]**

---

## 2. P,P,P,E

Solo Tx4 ejecutada. Cliente: sin movimientos. Int: Tx4 (E) +197k; Com. Int (par no cerrado según reglas) → saldo -197.000, detalle [-200.000, 3.000].

- **Saldo cliente:** **0** | **Detalle cliente:** **[]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 3. P,E,P,P

Par cliente (Tx1 P, Tx2 E): Tx2 suma +195k, Com. Pandy +5k. Par int (Tx3 P, Tx4 P): **suma_saldo / incluir en false** → no se escribe nada en int.

- **Saldo cliente:** **200.000** (195.000 + 5.000) | **Detalle cliente:** **[195.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[]**

---

## 4. P,E,P,E

Cliente igual que P,E,P,P. Int: Tx3 (P, contrapartida true) -200k; Tx4 (E) +197k; Com. Int +3k.

- **Saldo cliente:** **200.000** | **Detalle cliente:** **[195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 5. E,P,P,P

**Par cliente:** Tx1 E, Tx2 P → comisión Pandy **sí** (Tx1 ejecutada). Cliente: Tx1 −200k + comisión +5k → saldo **-195.000**, detalle **[-200.000, 5.000]**. **Int:** Tx3 y Tx4 ambas P → no se escribe nada → saldo **0**, detalle **[]**.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[]**

---

## 6. E,P,P,E

Cliente: igual que E,P,P,P (−200k + 5k). Int: Tx3 (P, true) -200k, Tx4 (E) +197k, Com. Int +3k → saldo -197.000.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 7. E,P,E,P

Mismo criterio cliente que E,P,P,P. Int: Tx3 (E) -200k, Tx4 (P, true) no suma según reglas; Com. Int entra → saldo -197.000.

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 8. E,P,E,E

Cliente: −195.000, [-200.000, 5.000]. Int: par cerrado → -200k + 197k + 3k = 0, detalle [-200.000, 197.000, 3.000].

- **Saldo cliente:** **-195.000** | **Detalle cliente:** **[-200.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[-200.000, 197.000, 3.000]**

---

## 9. E,E,P,P

Par cliente ejecutado → -200k + 195k + 5k = 0, detalle [-200.000, 195.000, 5.000]. **Int:** Tx3 y Tx4 ambas P → **no se escribe nada** → saldo **0**, detalle **[]**.

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[]**

---

## 10. E,E,P,E

Cliente: 0, [-200.000, 195.000, 5.000]. Int: -197.000, [-200.000, 3.000].

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 11. E,E,E,P

Cliente: 0, [-200.000, 195.000, 5.000]. Int: -197.000, [-200.000, 3.000].

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **-197.000** | **Detalle int:** **[-200.000, 3.000]**

---

## 12. E,E,E,E

Todo ejecutado. Cliente: 0, [-200.000, 195.000, 5.000]. Int: 0, [-200.000, 197.000, 3.000].

- **Saldo cliente:** **0** | **Detalle cliente:** **[-200.000, 195.000, 5.000]**
- **Saldo int:** **0** | **Detalle int:** **[-200.000, 197.000, 3.000]**

---

## Resumen tabla esperado (12 combinaciones)

| Combinación | Saldo Cliente | Saldo Int | Detalle Cliente              | Detalle Int                |
|-------------|---------------|-----------|------------------------------|----------------------------|
| P,P,P,P     | 0             | 0         | []                           | []                         |
| P,P,P,E     | 0             | -197.000  | []                           | [-200.000, 3.000]          |
| P,E,P,P     | 200.000       | 0         | [195.000, 5.000]             | []                         |
| P,E,P,E     | 200.000       | -197.000  | [195.000, 5.000]             | [-200.000, 3.000]          |
| E,P,P,P     | -195.000      | 0         | [-200.000, 5.000]            | []                         |
| E,P,P,E     | -195.000      | -197.000  | [-200.000, 5.000]            | [-200.000, 3.000]          |
| E,P,E,P     | -195.000      | -197.000  | [-200.000, 5.000]            | [-200.000, 3.000]          |
| E,P,E,E     | -195.000      | 0         | [-200.000, 5.000]            | [-200.000, 197.000, 3.000] |
| E,E,P,P     | 0             | 0         | [-200.000, 195.000, 5.000]   | []                         |
| E,E,P,E     | 0             | -197.000  | [-200.000, 195.000, 5.000]   | [-200.000, 3.000]          |
| E,E,E,P     | 0             | -197.000  | [-200.000, 195.000, 5.000]   | [-200.000, 3.000]          |
| E,E,E,E     | 0             | 0         | [-200.000, 195.000, 5.000]   | [-200.000, 197.000, 3.000] |

- **Intermediario saldo 0 y detalle []:** cuando Tx3 y Tx4 están **ambas P** (P,P,P,P; P,E,P,P; E,P,P,P; E,E,P,P).
- **Cliente con Tx1 ejecutada y Tx2 pendiente (E,P,*,*):** saldo **−195.000** (200k nominal − comisión Pandy 5k); detalle **[-200.000, 5.000]** (cobro nominal + línea de comisión).

Este documento es la fuente para auditar **tests/e2e/cc-combinaciones-esperado.js** y el log Excel del test E2E.
