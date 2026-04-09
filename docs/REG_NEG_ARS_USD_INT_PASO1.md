# ARS-USD con intermediario → `reglas_de_negocio` (paso 1)

## Objetivo

- Misma convención que **USD-ARS con intermediario** (`docs/REG_NEG_USD_ARS_INT_PASO1.md`), con **espejo de monedas**: acuerdo **recibe ARS (mr)** y **entrega USD (me)**.
- Hay **dos patrones de instrumentación** de dos transacciones; el motor necesita filas para el que uses:
  - **`ci_pc`:** ingreso **Cliente→Intermediario** (ARS) + egreso **Pandy→Cliente** (USD). Es el que usa el **wizard** si elegís ese radio y el que usa el **panel de órdenes** desde el fix de `main.js` (autocompletado por defecto).
  - **`cp_ic`:** ingreso **Cliente→Pandy** (ARS) + egreso **Intermediario→Cliente** (USD). **USD-USD+int** tenía reglas para **ambos** patrones; **ARS-USD+int** al principio solo tenía `ci_pc`, y el panel autocompletaba `cp_ic` → **no matcheaba ninguna regla** y la CC quedaba vacía aunque hubiera 12 filas.
- Script canónico (ambos patrones): **`sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`** (incluye bloque `cp_ic`).

## Qué ejecutar en Supabase (orden)

1. `sql/migracion_reglas_de_negocio_entidad_cc.sql` (si aún no está aplicada).
2. Cargar las reglas **ARS-USD + int** (elegí una):
   - **Solo `ci_pc` (12 filas):** `sql/insert_reglas_ars_usd_con_intermediario_si_faltan.sql`.
   - **Solo `cp_ic` (9 filas del bloque cp_ic en ese script; órdenes ya creadas desde el panel antes del fix):** `sql/insert_reglas_ars_usd_int_cp_ic_si_faltan.sql`.
   - **Todo junto (upsert):** `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql` o `sql/reglas_de_negocio_tabla.sql`.

## App (`main.js`)

- Si hay filas en **`reglas_de_negocio`** para **ARS-USD** + **`usa_intermediario`**, la sync usa **`aplicarMotorCcDesdeReglasDeNegocio`** y **no** aplica **`cc_modelo_reglas`** para ese caso (misma bandera que USD-ARS+int con filas en tabla).
- **Panel órdenes:** autocompletado de transacciones vacías para **ARS-USD** y **USD-ARS** con intermediario usa **`ci_pc`** por defecto (alineado a las reglas `ci_pc`). **USD-USD+int** sigue en **`cp_ic`** (tiene reglas para ambos en DB).
- El motor ya omitía `mr_prorrateado` en egreso **ARS** para ARS-USD sin int (`aplicarMotorCcDesdeReglasDeNegocio`); se mantiene igual con **+int**.
- **P,E en `ci_pc`:** con compromiso a cobrar pendiente en **+** (USD y ARS), el egreso Pandy→Cliente ejecutado con **`contrapartida_ejecutada = false`** debe registrar **`compromiso_pago` en −me (USD)** para anular la pata USD pendiente; la fila con **`contrapartida_ejecutada = true`** sigue en **+me** (cierra contra el ingreso ya ejecutado). Parche: `sql/migracion_reglas_int_ci_pc_compromiso_pago_anula_cobrar_pendiente.sql` (espejo de USD-ARS+int en `REG_NEG_USD_ARS_INT_PASO1.md`).
- **E,E en `ci_pc` (egreso P→C con ingreso Cliente→Intermediario ya ejecutado):** hace falta el par **linea 0 +** y **linea 1 −** con `monto_transaccion` en **USD** (moneda entregada en ARS-USD). Ver `docs/REG_NEG_USD_ARS_INT_PASO1.md` y `sql/migracion_reglas_ci_pc_egreso_pandy_ee_linea1_negativo.sql`.
- **E,E en `cp_ic`:** en CC cliente el **egreso Intermediario→Cliente** ya aporta **par ±** en la moneda **entregada** (USD en ARS-USD). El **ingreso Cliente→Pandy** debe aportar el **mismo criterio** en la moneda **recibida** (ARS): con `contrapartida_ejecutada = true` hacen falta **linea 0** `signo −1` y **linea 1** `signo +1`, ambas `monto_transaccion` y `cobro_realizado`, para que con orden ejecutada **no** quede saldo fantasma (ej. −mr ARS como si el cliente debiera tras haber pagado). Migración para bases ya desplegadas: **`sql/migracion_reglas_cp_ic_ingreso_ee_par_moneda_recibida.sql`**. Sigue sin aplicarse **+mr** en el **egreso** Int→Cliente para netear entre transacciones (criterio distinto; ver **`sql/migracion_reglas_cc_int_transacciones_independientes_quitar_espejo_mr.sql`**). El script **`sql/migracion_reglas_cp_ic_ee_neteo_cliente_cruzadas.sql` quedó obsoleto** (solo SELECT informativo).
- **P,E en `cp_ic`, CC intermediario:** con egreso Int→Cliente **ejecutado** e ingreso C→P **pendiente**, la CC intermediario lleva **una sola línea −me** en USD (moneda entregada en ARS-USD), alineada a USD-USD+int y a USD-ARS+int en espejo. Migración genérica: **`sql/migracion_reglas_cp_ic_int_pe_intermediario_una_sola_linea_negativa.sql`**; canónico en `sql/reglas_de_negocio_tabla.sql` y `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql`.

## E2E

- `npm run test:e2e-cc-ars-usd-int-inversa` o `TIPO_CODIGO=ARS-USD npx playwright test tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js`
- Expectativas: `tests/e2e/cc-intermediario-inversa-esperado.js` (`COMBINACIONES_ARS_USD_INT_INVERSA`), montos fijos **5M ARS / 5k USD**, TC **1000**.
- **E,P:** el par que netea el ingreso ejecutado va en **ARS** (−mr / +mr); la posición abierta es **−me en USD**. No confundir con USD-ARS E,P, donde el par netea en **USD** y queda **−me en ARS**; el tercer importe del detalle ordenado no es el mismo “+5k” en ambos tipos.

## Referencia

- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- `docs/REGLAS_DE_NEGOCIO.md`
- `sql/migracion_cc_modelo_reglas_ars_usd_intermediario_flujo_inverso_operativo.sql` (modelo previo en `cc_modelo_reglas`; convive hasta que las reglas en `reglas_de_negocio` estén cargadas y el E2E verde)
