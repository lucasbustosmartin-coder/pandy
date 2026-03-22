# USD-USD sin intermediario

## Comisión implícita

En este tipo **no hay comisión como línea aparte en la orden**: la **comisión de Pandy** es la **diferencia entre lo que recibe el cliente (acuerdo) y lo que entrega**:

**`comisión = monto_recibido − monto_entregado`** (ambos en USD).

- En la UI, `monto_recibido` debe ser **mayor** que `monto_entregado` (si no, error de validación).
- Ese margen es el **ingreso de Pandy** por el acuerdo (ej. recibe 10.000 USD y entrega 9.700 USD → comisión 300 USD).

## Dónde vive la lógica CC

- **Única fuente de verdad:** tabla **`reglas_de_negocio`** (`usa_intermediario = false`), modelo simple: solo movimientos CC coherentes con orden/transacciones (sin espejo ni flags “suma saldo”).
  - Ingresos/egresos: `monto_transaccion` o totales de acuerdo **`mr` / `me`** según la fila.
  - **E,P** (ingreso ejecutado, egreso pendiente): en la **misma** transacción de egreso pendiente (`contrapartida_ejecutada = true`) van **dos filas** (`linea` 0 y 1): **`+mr`** (anula la deuda del cobro bruto) y **`-me`** (lo que Pandy debe al cliente). Saldo neto **−me**.
  - **P,E** (ingreso pendiente, egreso ejecutado): solo **Pandy cumplió** (pagó **me** en caja). En CC: **ingreso pendiente** una línea **`+monto_transacción`** (compromiso a cobrar = cliente nos debe, convención positivo). En **egreso ejecutado** con `contrapartida_ejecutada = false` van **dos filas** (`linea` 0 y 1): **−monto_transacción** y **+monto_transacción**, que **anulan el pago de Pandy** en la cuenta corriente. Lo que **queda** es la **deuda del cliente hacia Pandy** (**+mr**, p. ej. 10.000 USD), no el saldo neto **−me** de E,P.
  - Comisión explícita en CC: **`mr_menos_me`** en la fila **`es_comision`** (solo **E,E** par cliente cerrado; alineado a `comisiones_orden` Pandy).
- Scripts: **`sql/reglas_de_negocio_tabla.sql`** (bootstrap) o **`sql/migracion_reglas_usd_usd_sin_int.sql`** (entornos ya desplegados). Las filas USD-USD sin int fueron **eliminadas** de `cc_modelo_reglas`.

## E2E

- Montos fijos de ejemplo: `tests/e2e/cc-tipos-activos-esperado.js` → `USD_USD_FIJOS` y `COMBINACIONES_USD_USD` (10.000 / 9.700 / comisión 300).
- Solo USD-USD: `npm run test:e2e-cc-usd-usd-sin-int`
- Los tres tipos 2 tx: `npm run test:e2e-cc-tipos-2tx`

## Referencia

- `docs/REGLAS_DE_NEGOCIO.md` — alcance `reglas_de_negocio` vs `cc_modelo_reglas`
- `docs/CC_MODELO_ENGINE_TABLA.md` — motor desde tabla
