# Cuenta corriente intermediario – evaluación de pasos (ARS-ARS CHEQUE)

## Secuencia que relataste

| Paso | Acción | Impacto en CC intermediario (lo que pedís) |
|------|--------|---------------------------------------------|
| 1 | Cliente paga a Pandy | No impacta. OK. |
| 2 | Pandy paga a Intermediario (cheque 50.000) | Update a cerrado del movimiento de origen **sin cambiar signo**. Además: (a) generar **deuda del intermediario con Pandy -49.250**; (b) generar **registro de la comisión que ganó el intermediario** (en transacciones, CC y tabla orden_comisiones_generadas). |
| 3 | Pandy paga al cliente | No impacta. OK. |
| 4 | Intermediario paga a Pandy (49.250 efectivo) | Registrar **+49.250** (cobro). |

Convención en la app: **suma &lt; 0 → intermediario debe (verde); suma &gt; 0 → Pandy debe (rojo)**. Saldo = suma de movimientos. Si todo está ejecutado, la CC con el intermediario tiene que dar **0**.

---

## Evaluación

Tu relato es **coherente** y falta alinear el código con esta regla.

### Qué hace hoy el código (resumido)

- **Momento cero:** Dos filas: **Debe** (-50.000, ligada al egreso cheque Pandy→Int) y **Compensación** (+50.000, ligada al ingreso efectivo Int→Pandy). Suma = 0.
- **Paso 2 (egreso Pandy→Int ejecutada):** Solo se hace UPDATE de la fila Debe a `estado = cerrado` **sin poner montos en 0**. No se inserta la deuda -49.250 ni se registra la comisión de forma que cierre la cuenta.
- **Paso 2 – comisión:** `asegurarComisionIntermediario` crea la transacción "Comisión del acuerdo" (egreso Pandy→Int por 750) y un movimiento en CC con **monto negativo** (-750). No se registra por separado la “obligación” de Pandy de pagar esa comisión (+750).
- **Paso 4 (ingreso Int→Pandy ejecutada):** Se cierra la Compensación y se insertan **Cobro +49.250** y **Descuento -49.250**. Suma de esos dos = 0, así que el cobro de 49.250 **no** queda reflejado en el saldo.

Consecuencia: la CC no cierra en 0 y no se ve claramente la deuda del intermediario (-49.250) ni el cobro (+49.250).

---

## Regla propuesta para que la CC cierre en 0

1. **Paso 2 – Egreso Pandy→Int (cheque 50.000)**
   - **Cerrar el movimiento de origen (Debe):** UPDATE `estado = 'cerrado'` y **poner `monto_usd = 0`, `monto_ars = 0`, `monto_eur = 0`** en esa fila para que no siga sumando -50.000.
   - **Insertar un movimiento:** “Deuda del intermediario con Pandy” con **monto = -montoEfectivoInt** (ej. -49.250), donde `montoEfectivoInt = mr * (1 - tasa_descuento_intermediario)`.
   - **Insertar obligación de comisión:** Un movimiento “Comisión del acuerdo” con **monto = +comisión intermediario** (ej. +750), porque Pandy les debe esa comisión.
   - **Mantener** `asegurarComisionIntermediario`: crea la transacción de pago de comisión y el movimiento en CC con **monto = -comisión** (pago), de modo que obligación (+750) y pago (-750) se compensen.

   Después del paso 2, la suma en CC debe ser: **-49.250** (ellos nos deben) + 750 (nosotros les debemos) - 750 (pago) = **-49.250**.

2. **Paso 4 – Ingreso Int→Pandy (49.250 efectivo)**
   - **Cerrar el movimiento de origen (Compensación):** UPDATE `estado = 'cerrado'` y **poner `monto_usd = 0`, `monto_ars = 0`, `monto_eur = 0`** en esa fila.
   - **Insertar un solo movimiento:** “Cobro por ARS 49.250” con **monto = +49.250** (sin insertar el “Descuento sobre cheque” que hoy suma -49.250 y hace que el cobro no impacte en el saldo).

   Después del paso 4: -49.250 + 49.250 = **0**.

3. **Reversa (ejecutada → pendiente)**  
   Al volver a pendiente el egreso Pandy→Int hay que borrar los movimientos de deuda -49.250 y de comisión (+750 y -750) y reabrir la fila Debe con sus montos originales. Al volver a pendiente el ingreso Int→Pandy hay que borrar el cobro +49.250 y reabrir la Compensación.

---

## Resumen

- Tu orden de pasos y el impacto que querés en la CC son **correctos**.
- Para que la CC intermediario cierre en 0 hace falta:
  1. En **paso 2:** cerrar la fila Debe **anulando sus montos** (0), insertar **deuda -49.250** e **obligación de comisión +750**; mantener el movimiento de pago de comisión -750.
  2. En **paso 4:** cerrar la fila Compensación **anulando sus montos** (0) e insertar **solo el cobro +49.250** (sin el movimiento “Descuento” que resta lo mismo).
  3. Ajustar la **reversa** para que borre estos movimientos y restaure las filas de momento cero cuando corresponda.

Con eso la regla queda alineada con tu relato y la CC da 0 cuando todo está ejecutado.
