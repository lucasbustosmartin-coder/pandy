# USD-ARS con intermediario → `reglas_de_negocio` (paso 1)

## Objetivo de este paso

- Extender la tabla **`reglas_de_negocio`** con **`entidad_cc`** (`cliente` | `intermediario`) para poder expresar, en la misma tabla, movimientos de **CC cliente** y **CC intermediario** (antes solo había filas “de cliente” en la práctica).
- Cargar la primera tanda de reglas para el **flujo inverso operativo** (2 transacciones: Cliente→Intermediario, Pandy→Cliente), alineada a:
  - `sql/migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql`
  - Ajustes relacionados en `sql/cc_modelo_reglas_todas_combinaciones.sql` (§4–§5).

## Qué ejecutar en Supabase (orden)

1. `sql/migracion_reglas_de_negocio_entidad_cc.sql`
2. `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql`
3. Si la base ya tenía el lote anterior: `sql/migracion_reglas_usd_ars_int_ep_ingreso_ejecutada_contrapartida_false_tres_lineas.sql` y `sql/migracion_reglas_usd_ars_int_ee_ingreso_ejecutada_true_par_usd.sql` (o reaplicar el script completo del punto 2).

## App (`main.js`)

- Si hay filas en **`reglas_de_negocio`** para **USD-ARS** + **`usa_intermediario`**, la sync usa **`aplicarMotorCcDesdeReglasDeNegocio`** y **no** aplica **`cc_modelo_reglas`** para ese caso.
- **E,P (ingreso C→Int ejecutado, egreso P→C pendiente):** hacen falta **tres** filas para CC cliente con `contrapartida_ejecutada = false`: **−mr y +mr en USD** y **−me en ARS** (detalle alineado a §5 `cc_modelo_reglas`). Migración: `sql/migracion_reglas_usd_ars_int_ep_ingreso_ejecutada_contrapartida_false_tres_lineas.sql`.
- **E,E (ambas transacciones ejecutadas):** en el ingreso con `ejecutada` + `contrapartida_ejecutada = true` hacen falta **tres** filas cliente (**−me ARS**, **−mr USD**, **+mr USD**); el egreso aporta **+me ARS** → **cuatro** importes en detalle. Si en Supabase faltaban las USD, el E2E fallaba (esperaba 4 montos, recibía 2). Migración: `sql/migracion_reglas_usd_ars_int_ee_ingreso_ejecutada_true_par_usd.sql` (o reaplicar `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql`).
- **ARS-USD** con intermediario: **`sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`** + **`docs/REG_NEG_ARS_USD_INT_PASO1.md`** (misma idea que USD-ARS+int con espejo de monedas).
- **Patrón `cp_ic`** (Cliente→Pandy + Intermediario→Cliente) para **USD-ARS+int:** filas en `sql/reglas_de_negocio_tabla.sql` (bloque USD-ARS true `cp_ic`); carga puntual análoga a `sql/insert_reglas_ars_usd_int_cp_ic_si_faltan.sql` si hiciera falta.
- **No** borra filas de `cc_modelo_reglas` (conviven hasta migración completa y E2E verdes).
- **No** cubre todavía el esquema “Pandy central” / 4 transacciones (CHEQUE-like): habrá más filas en un paso posterior.

## Próximo paso (paso 2)

- **Hecho en app:** `getReglasDeNegocio(codigo, usa_intermediario)` + `aplicarMotorCcDesdeReglasDeNegocio` con **`entidad_cc`** (cliente e intermediario); USD-ARS + int usa la tabla si hay filas.
- **Pendiente:** validar E2E y, cuando todo cierre, opcionalmente retirar duplicados de **`cc_modelo_reglas`** para USD-ARS + int.
- E2E: `npm run test:e2e-cc-02-03` o `tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js`.

## Referencia

- Corazón del sistema: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- Reglas generales: `docs/REGLAS_DE_NEGOCIO.md`
