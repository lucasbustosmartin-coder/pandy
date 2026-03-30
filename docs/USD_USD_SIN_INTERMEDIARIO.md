# USD-USD sin intermediario

## Comisión implícita

En este tipo **no hay comisión como línea aparte en la orden**: la **comisión de Pandy** es la **diferencia entre lo que recibe el cliente (acuerdo) y lo que entrega**:

**`comisión = monto_recibido − monto_entregado`** (ambos en USD).

- En la UI, `monto_recibido` debe ser **mayor** que `monto_entregado` (si no, error de validación).
- Ese margen es el **ingreso de Pandy** por el acuerdo (ej. recibe 10.000 USD y entrega 9.700 USD → comisión 300 USD).

## Dónde vive la lógica CC

- **Única fuente de verdad:** tabla **`reglas_de_negocio`** (`usa_intermediario = false`), modelo simple: solo movimientos CC coherentes con orden/transacciones (sin espejo ni flags “suma saldo”).
  - Ingresos/egresos: `monto_transaccion` o totales de acuerdo **`mr` / `me`** según la fila.
  - **E,P** (ingreso ejecutado, egreso pendiente): en la **misma** transacción de egreso pendiente (`contrapartida_ejecutada = true`) van **dos filas** (`linea` 0 y 1): **`+mr`** y, en la tabla, **`−me`** en `linea` 1. **Sin** línea explícita de comisión en el catálogo, el saldo neto queda **−me**. **Con** la fila **`es_comision`** `pendiente`/`false` (+ **`mr_menos_me`**), sumar además **−me** duplicaría el spread (p. ej. −9.400); el motor (`main.js`) aplica en ese caso la segunda línea como **−mr** (compromiso de entrega nominal), y la comisión **+ (mr − me)** deja el neto en **−me** (−9.700 en el ejemplo 10.000 / 9.700). Visible en Movimientos; **G/P** sigue sin contar pendientes.
  - **P,E** (ingreso pendiente, egreso ejecutado): solo **Pandy cumplió** (pagó **me** en caja). En CC: **ingreso pendiente** una línea **`+monto_transacción`** (compromiso a cobrar = cliente nos debe, convención positivo). En **egreso ejecutado** con `contrapartida_ejecutada = false` van **dos filas** (`linea` 0 y 1): **−monto_transacción** y **+monto_transacción**, que **anulan el pago de Pandy** en la cuenta corriente. Lo que **queda** es la **deuda del cliente hacia Pandy** (**+mr**, p. ej. 10.000 USD), no el saldo neto **−me** de E,P.
  - Comisión explícita en CC: **`mr_menos_me`** en la fila **`es_comision`**: **E,E** (par cliente cerrado, `ejecutada` / `contrapartida_ejecutada = true`); **E,P** sin int. (solo cobro ejecutado) con fila **`pendiente` / `false`** como arriba.
- Scripts: **`sql/reglas_de_negocio_tabla.sql`** (bootstrap); migraciones **`sql/migracion_reglas_usd_usd_sin_int.sql`**, **`sql/migracion_usd_usd_sin_int_comision_ep_gp.sql`** (fila comisión E,P). Las filas USD-USD sin int fueron **eliminadas** de `cc_modelo_reglas`.

## E2E

- Montos fijos de ejemplo: `tests/e2e/cc-tipos-activos-esperado.js` → `USD_USD_FIJOS` y `COMBINACIONES_USD_USD` (10.000 / 9.700 / comisión 300).
- Solo USD-USD: `npm run test:e2e-cc-usd-usd-sin-int`
- Los tres tipos 2 tx: `npm run test:e2e-cc-tipos-2tx`

## Referencia

- `docs/REGLAS_DE_NEGOCIO.md` — alcance `reglas_de_negocio` vs `cc_modelo_reglas`
- `docs/CC_MODELO_ENGINE_TABLA.md` — motor desde tabla
