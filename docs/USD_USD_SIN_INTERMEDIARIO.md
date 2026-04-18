# USD-USD sin intermediario

## Comisión implícita

En este tipo **no hay comisión como línea aparte en la orden**: la **comisión de Pandy** es la **diferencia entre lo que recibe el cliente (acuerdo) y lo que entrega**:

**`comisión = monto_recibido − monto_entregado`** (ambos en USD).

- En la UI, `monto_recibido` debe ser **mayor** que `monto_entregado` (si no, error de validación).
- Ese margen es el **ingreso de Pandy** por el acuerdo.

En el bloque **Datos del acuerdo** (importe = monto que recibe el cliente, tasa al cliente en %), el usuario elige la **interpretación de la tasa** (solo en la UI de USD-USD). Las tasas **%** admiten **hasta 6 decimales**. **«Comisión a Recibir»** (spread **mr − me**) es **editable**: al modificarla, la app recalcula la tasa al cliente y los montos (auditoría al confirmar el campo y al guardar la orden).

1. **Descuento sobre lo recibido** (por defecto; compatible con órdenes guardadas antes sin campo explícito):  
   **`monto_entregado = importe × (1 − tasa_al_cliente / 100)`**  
   **`comisión = importe − monto_entregado`** (equivale a **importe × tasa / 100**).

2. **Incremento sobre lo entregado** (tasa inclusiva):  
   **`monto_entregado = importe / (1 + tasa_al_cliente / 100)`**  
   **`comisión = importe − monto_entregado`**.

La elección se persiste en **`ordenes.usd_usd_tasa_cliente_modo`** (`descuento` | `incremento`; `NULL` en órdenes viejas = descuento). Migración: `sql/migracion_ordenes_usd_usd_tasa_cliente_modo.sql` y RPC `sql/ordenes_insertar_con_proximo_numero.sql`.

Ejemplo (modo descuento): importe 5.300 USD y tasa 6 % → entrega 5.300 × 0,94 = **4.982 USD**, comisión **318 USD**.

## Dónde vive la lógica CC

- **Única fuente de verdad:** tabla **`reglas_de_negocio`** (`usa_intermediario = false`), modelo simple: solo movimientos CC coherentes con orden/transacciones (sin espejo ni flags “suma saldo”).
  - Ingresos/egresos: `monto_transaccion` o totales de acuerdo **`mr` / `me`** según la fila.
  - **E,P** (ingreso ejecutado, egreso pendiente): en la **misma** transacción de egreso pendiente (`contrapartida_ejecutada = true`) van **dos filas** (`linea` 0 y 1): **`+mr`** y, en la tabla, **`−me`** en `linea` 1. **Sin** línea explícita de comisión en el catálogo, el saldo neto queda **−me**. **Con** la fila **`es_comision`** `pendiente`/`false` (+ **`mr_menos_me`**), sumar además **−me** duplicaría el spread; el motor (`main.js`) aplica en ese caso la segunda línea como **−mr** (compromiso de entrega nominal), y la comisión **+ (mr − me)** deja el neto en **−me** (p. ej. −4.982 con acuerdo 5.300 / 4.982 y comisión 318). Visible en Movimientos; en **G/P Operativa**, las bolsas de **CC** del panel incluyen **pendiente** y **cerrado** (como Saldos); la comisión del acuerdo entra por su bolsa para no duplicar el spread en el total.
  - **P,E** (ingreso pendiente, egreso ejecutado): solo **Pandy cumplió** (pagó **me** en caja). En CC: **ingreso pendiente** una línea **`+monto_transacción`** (compromiso a cobrar = cliente nos debe, convención positivo). En **egreso ejecutado** con `contrapartida_ejecutada = false` van **dos filas** (`linea` 0 y 1): **−monto_transacción** y **+monto_transacción**, que **anulan el pago de Pandy** en la cuenta corriente. Lo que **queda** es la **deuda del cliente hacia Pandy** (**+mr**, p. ej. 10.000 USD), no el saldo neto **−me** de E,P.
  - Comisión explícita en CC: **`mr_menos_me`** en la fila **`es_comision`**: **E,E** (par cliente cerrado, `ejecutada` / `contrapartida_ejecutada = true`); **E,P** sin int. (solo cobro ejecutado) con fila **`pendiente` / `false`** como arriba.
- Scripts: **`sql/reglas_de_negocio_tabla.sql`** (bootstrap); migraciones **`sql/migracion_reglas_usd_usd_sin_int.sql`**, **`sql/migracion_usd_usd_sin_int_comision_ep_gp.sql`** (fila comisión E,P). Las filas USD-USD sin int fueron **eliminadas** de `cc_modelo_reglas`.

## E2E

- Montos fijos de ejemplo: `tests/e2e/cc-tipos-activos-esperado.js` → `USD_USD_FIJOS` y `COMBINACIONES_USD_USD` (5.300 / 4.982 / comisión 318 con tasa cliente 6 %).
- Solo USD-USD: `npm run test:e2e-cc-usd-usd-sin-int`
- Los tres tipos 2 tx: `npm run test:e2e-cc-tipos-2tx`

## Referencia

- `docs/REGLAS_DE_NEGOCIO.md` — alcance `reglas_de_negocio` vs `cc_modelo_reglas`
- `docs/CC_MODELO_ENGINE_TABLA.md` — motor desde tabla
