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
  - **E,P** (ingreso ejecutado, egreso pendiente): el **cobro** en CC del cliente es **−me** (entrega neta ya acordada al cobrar). En el egreso pendiente (`contrapartida_ejecutada = true`) solo **`+mr`** «Compromiso de Pago» (sin segunda fila **−me** en esa trx: el spread **mr−me** va en la fila **`es_comision`** aparte). La comisión aparece como **−318** (signo **−1** sobre **mr_menos_me**) en estado **cerrada** en Movimientos. Saldo resumen cliente USD: **−me − (mr−me) + mr = 0**. En **G/P Operativa**, la línea de comisión cerrada entra en las bolsas de CC cerradas como el resto de movimientos cerrados.
  - **P,P** (ambas patas pendientes, con **mr > me**): el **compromiso a cobrar** del ingreso Cliente→Pandy (`contrapartida_ejecutada = false`) usa **`me`** (entrega neta al cliente), no **`monto_transaccion`** (= **mr**), para no duplicar el nominal junto con la fila **`es_comision`** **`mr_menos_me`**. En el egreso pendiente con `contrapartida_ejecutada = false` solo **`−me`** en «Compromiso de Pago» (no hay fila **`+mr`** en esa clave). Ejemplo 5.300 / 4.982 / 318: movimientos **+4.982**, **−4.982**, **+318** → saldo CC del acuerdo **318** (la comisión pendiente de Pandy).
  - **P,E** (ingreso pendiente, egreso ejecutado): solo **Pandy cumplió** (pagó **me** en caja). En CC: **ingreso pendiente** una línea **`+monto_transacción`** (compromiso a cobrar = cliente nos debe, convención positivo). En **egreso ejecutado** con `contrapartida_ejecutada = false` van **dos filas** (`linea` 0 y 1): **−monto_transacción** y **+monto_transacción**, que **anulan el pago de Pandy** en la cuenta corriente. Lo que **queda** es la **deuda del cliente hacia Pandy** (**+mr**, p. ej. 10.000 USD), no el saldo neto **−me** de E,P. **UI / referencia:** la línea **−me** se referencia a la **Trans. del ingreso pendiente** (Tx1) para dejar claro el cobro pendiente sobre el **+mr** de esa misma transacción; la **+me** sigue referenciada al egreso ejecutado (Tx2). **No** se agrega fila sintética aparte **`mr_menos_me`** (+318) en esta combinación: el spread ya queda cubierto por el par ± del egreso. En **USD-USD con intermediario `cp_ic`** (egreso **Intermediario→Cliente** ejecutado e ingreso **Cliente→Pandy** pendiente) aplica el mismo criterio en el motor (`main.js`); ver **`docs/USD_USD_CON_INTERMEDIARIO.md`**.
  - Comisión explícita en CC: **`mr_menos_me`** en la fila **`es_comision`**: **E,E** (par cliente cerrado, `ejecutada` / `contrapartida_ejecutada = true`); **E,P** (cobro ejecutado, entrega pendiente) con fila **`ejecutada` / `contrapartida_ejecutada = false`**, **signo −1** (cargo al cliente), cerrada en el motor.
- Scripts: **`sql/reglas_de_negocio_tabla.sql`** (bootstrap); migraciones **`sql/migracion_reglas_usd_usd_sin_int.sql`**, **`sql/migracion_usd_usd_sin_int_comision_ep_gp.sql`** (fila comisión E,P). Las filas USD-USD sin int fueron **eliminadas** de `cc_modelo_reglas`.

## Invariante fixture E2E (tipos 2 transacciones)

- **Margen del acuerdo:** con `mr = 5.300` y `me = 4.982`, el spread **`mr − me = 318` USD** es el mismo en **todas** las combinaciones P/E del test (`COMBINACIONES_USD_USD` en `tests/e2e/cc-tipos-activos-esperado.js`).
- **Saldo CC cliente en resumen:** la app suma movimientos **pendiente y cerrado** (no anulados); lo pendiente **sí** suma al saldo (no es un “subtotal opcional”). Por eso el **número mostrado en la columna USD** **cambia** según la combinación: no puede ser **318** en las cuatro a la vez sin romper la partida doble (p. ej. con **E,P** el neto es **0** (−me, −(mr−me) y +mr); con **P,E** queda el **+mr** del ingreso pendiente tras anular el egreso ejecutado en CC; con **E,E** el par cliente en CC suele **netear a 0** y la comisión queda como línea explícita en el detalle).
- **P,P** es el caso donde, con la matriz vigente de `reglas_de_negocio`, el **saldo cliente USD** del resumen coincide con **318** (= solo spread pendiente coherente con **+me**, **−me** y **+ (mr−me)** en CC).

## E2E

- Montos fijos de ejemplo: `tests/e2e/cc-tipos-activos-esperado.js` → `USD_USD_FIJOS` y `COMBINACIONES_USD_USD` (5.300 / 4.982 / comisión 318 con tasa cliente 6 %).
- Solo USD-USD: `npm run test:e2e-cc-usd-usd-sin-int`
- Los tres tipos 2 tx: `npm run test:e2e-cc-tipos-2tx`

## Referencia

- `docs/REGLAS_DE_NEGOCIO.md` — alcance `reglas_de_negocio` vs `cc_modelo_reglas`
- `docs/CC_MODELO_ENGINE_TABLA.md` — motor desde tabla
