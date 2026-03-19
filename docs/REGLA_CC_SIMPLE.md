# Regla CC simplificada: Compromiso y Compromiso Saldado

## Principios

1. **Un registro por evento y por moneda del compromiso.** Cada fila impacta solo una moneda: una sola de `monto_usd`, `monto_ars`, `monto_eur` es no nula (o distinta de cero); `moneda` indica cuál.
2. **Sin estado** a nivel lógico: no se usa pendiente/cerrado para el saldo. El saldo es la **suma de todos los movimientos** (solo se excluyen los con `estado = 'anulado'`).
3. **Número de transacción** en tabla (`transaccion_numero`) y en el concepto ("Orden Nro X **y Trans Nro Y**") para trazabilidad.
4. **Aplica igual** a cuenta corriente cliente y a cuenta corriente intermediario.

## Conceptos

- **Compromiso - Orden Nro X y Trans Nro Y**  
  Momento cero: obligación en una sola moneda. Una fila por moneda del acuerdo (moneda recibida y moneda entregada). Signo: negativo = participante (cliente/intermediario) debe; positivo = Pandy debe.

- **Compromiso Saldado - Orden Nro X y Trans Nro Y**  
  Se inserta cuando se ejecuta una pata: una fila por moneda saldada. Cancela el compromiso en esa moneda (mismo monto, signo opuesto).

## Ejemplo USD-ARS (cliente paga USD)

- Momento cero: 2 filas  
  - Compromiso, USD: `monto_usd = -5000`, `monto_ars = 0`, `monto_eur = 0`  
  - Compromiso, ARS: `monto_usd = 0`, `monto_ars = +6.950.000`, `monto_eur = 0`  
- Cliente paga USD (ejecutada): 1 fila  
  - Compromiso Saldado, USD: `monto_usd = +5000`, resto 0  
- Suma USD = 0; suma ARS = +6.950.000 → Pandy debe ARS hasta que se ejecute el egreso.
- Al ejecutar egreso (Pandy paga ARS): 1 fila  
  - Compromiso Saldado, ARS: `monto_ars = -6.950.000`  
- Suma ARS = 0.

## Reversa (ejecutada → pendiente)

Se **borran** las filas con concepto "Compromiso Saldado" de esa transacción. No se actualiza estado en otras filas.

## Saldo en la vista

En la vista de Cuenta corriente **solo se contabilizan movimientos ligados a transacciones ejecutadas**. Así, si todas las transacciones están pendientes, nadie le debe nada a nadie (nadie movió una pieza).

- **Compromiso Saldado:** siempre se suma (solo existe cuando hubo ejecución).
- **Compromiso:** se suma solo si la transacción de esa fila está ejecutada **o** si la orden tiene al menos una transacción ejecutada (para que aparezca la deuda en la otra moneda cuando una pata ya se pagó).
- Movimientos legacy (sin concepto Compromiso): se suman igual que antes.

Se excluyen siempre los movimientos con `estado = 'anulado'`.
