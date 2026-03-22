# Neteo en CC: USD-ARS vs ARS-USD (con intermediario, flujo inverso)

Regla **simétrica por moneda de la transacción ejecutada** (la que “cierra” primero en el escenario P,E):

| Tipo operación | Moneda recibida (`mr`) | Moneda entregada (`me`) | En P,E suele ejecutarse primero | En CC debe **netearse** (saldo 0 en esa moneda) | Queda **expuesto** en saldo |
|----------------|------------------------|-------------------------|-----------------------------------|--------------------------------------------------|-----------------------------|
| **USD-ARS**    | USD                    | ARS                     | Egreso Pandy→Cliente en **ARS**   | **ARS** (dos líneas −/+ `monto_transacción` en egreso ejecutado, contrapartida false) | **USD** (−mr pendiente en Tx1)  |
| **ARS-USD**    | ARS                    | USD                     | Egreso Pandy→Cliente en **USD**   | **USD** (dos líneas −/+ `monto_transacción` en egreso ejecutado, contrapartida false) | **ARS** (−mr pendiente en Tx1)  |

No es la misma regla aplicada a los dos códigos: es el **espejo del negocio** según qué pata del acuerdo se ejecutó.

## En código (`main.js`)

- **USD-ARS sin intermediario:** CC sale de **`reglas_de_negocio`** + `aplicarMotorCcDesdeReglasDeNegocio`. Con **E,E**, la tabla define **dos líneas por transacción** (ingreso ARS+USD, egreso ARS+USD) → **cuatro** movimientos que netean por moneda. Ver **`docs/MODELO_CC_USD_ARS_TEORICO.md`**. Con **P,E**, el egreso ejecutado con **contrapartida_ejecutada = false** lleva **dos líneas ARS** −/+ `monto_transacción` (neteo en ARS); el **USD** pendiente queda en el ingreso Tx1; ver **`docs/REGLAS_DE_NEGOCIO.md`**.

- **Con intermediario** (`cc_modelo_reglas`): históricamente hubo **merge** de lookups `contrapartida` false + true por `linea_motor` en egreso P→C ejecutado cuando el par cliente cerraba, para no quedarse solo con −mr USD sin la pata +me ARS del egreso (saldo USD mal). Flags tipo `omitirEspejo*` pasaron a columnas `motor_suprime_espejo_*` donde aplique; ver `docs/CC_FUENTE_DE_VERDAD_TABLA_Y_MULTI_PATA.md`.

Un cambio acotado a **USD-ARS** no debe tocar condiciones bajo **ARS-USD** y viceversa.

## Tests E2E

Expectativas fijadas en `tests/e2e/cc-intermediario-inversa-esperado.js`:

- **USD-ARS P,E**: `saldoCliARS: 0`, `saldoCliUSD: -5000`.
- **ARS-USD P,E**: `saldoCliUSD: 0`, `saldoCliARS: -5000000`.

Correr **`03-cc-intermediario-inversa-combinaciones.spec.js`** valida ambos sin mezclar.

**Sin intermediario** (`tests/e2e/cc-tipos-activos-esperado.js`): **ARS-USD P,E** — neteo en **USD** (detalle: par USD ± en egreso ejecutado + línea ARS del compromiso pendiente); saldo **USD 0**, **ARS −mr**. **USD-ARS P,E** — neteo en **ARS** (dos líneas ARS ±); saldo **ARS 0**, **USD −mr** pendiente. Reglas: `sql/reglas_de_negocio_tabla.sql` y `sql/migracion_reglas_usd_ars_sin_int_pe_egreso_dos_lineas_ars.sql` (USD-ARS) / `sql/migracion_reglas_ars_usd_pe_egreso_usd_par.sql` (ARS-USD).
