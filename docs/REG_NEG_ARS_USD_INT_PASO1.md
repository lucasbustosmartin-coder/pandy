# ARS-USD con intermediario → `reglas_de_negocio` (paso 1)

## Objetivo

- Misma convención que **USD-ARS con intermediario** (`docs/REG_NEG_USD_ARS_INT_PASO1.md`), con **espejo de monedas**: acuerdo **recibe ARS (mr)** y **entrega USD (me)**; transacciones **Cliente→Intermediario** (ingreso en ARS) y **Pandy→Cliente** (egreso en USD).
- Script canónico: **`sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`**.

## Qué ejecutar en Supabase (orden)

1. `sql/migracion_reglas_de_negocio_entidad_cc.sql` (si aún no está aplicada).
2. `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`

## App (`main.js`)

- Si hay filas en **`reglas_de_negocio`** para **ARS-USD** + **`usa_intermediario`**, la sync usa **`aplicarMotorCcDesdeReglasDeNegocio`** y **no** aplica **`cc_modelo_reglas`** para ese caso (misma bandera que USD-ARS+int con filas en tabla).
- El motor ya omitía `mr_prorrateado` en egreso **ARS** para ARS-USD sin int (`aplicarMotorCcDesdeReglasDeNegocio`); se mantiene igual con **+int**.

## E2E

- `npm run test:e2e-cc-ars-usd-int-inversa` o `TIPO_CODIGO=ARS-USD npx playwright test tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js`
- Expectativas: `tests/e2e/cc-intermediario-inversa-esperado.js` (`COMBINACIONES_ARS_USD_INT_INVERSA`), montos fijos **5M ARS / 5k USD**, TC **1000**.
- **E,P:** el par que netea el ingreso ejecutado va en **ARS** (−mr / +mr); la posición abierta es **−me en USD**. No confundir con USD-ARS E,P, donde el par netea en **USD** y queda **−me en ARS**; el tercer importe del detalle ordenado no es el mismo “+5k” en ambos tipos.

## Referencia

- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- `docs/REGLAS_DE_NEGOCIO.md`
- `sql/migracion_cc_modelo_reglas_ars_usd_intermediario_flujo_inverso_operativo.sql` (modelo previo en `cc_modelo_reglas`; convive hasta que las reglas en `reglas_de_negocio` estén cargadas y el E2E verde)
