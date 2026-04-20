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
- **P,P (par cliente todo pendiente):** `contrapartidaEjecutada()` es **false** en ambas transacciones hasta que una pata ejecute; hacen falta filas en `reglas_de_negocio` con **`estado_transaccion = pendiente`** y **`contrapartida_ejecutada = false`** (ingreso Cliente→Intermediario en **mr/me** por moneda; egreso Pandy→Cliente en **monto_transacción** en moneda entregada; CC intermediario en ingreso pendiente). Canónico en `sql/reglas_de_negocio_tabla.sql`; bases ya desplegadas: `sql/migracion_reglas_usd_ars_ars_usd_int_ci_pc_pp_contrapartida_false.sql`. En **CC cliente**, el motor **no** duplica la pata **me** del ingreso con el egreso P→C: omite la fila **me** del ingreso en moneda de **entrega**; el **mr** en moneda **recibida** queda **+** «Compromiso a Cobrar» (cobro pendiente), no «Cobro realizado» negativo (`main.js`). El egreso aporta **−monto** «Compromiso de Pago» en moneda entregada.
- **E,P (ingreso C→Int ejecutado, egreso P→C pendiente):** el ingreso ejecutado con **contrapartida false** sigue la migración **tres líneas** USD (−mr/+mr) + ARS −me (`sql/migracion_reglas_usd_ars_int_ep_ingreso_ejecutada_contrapartida_false_tres_lineas.sql`). El egreso **pendiente** lleva **`contrapartida_ejecutada = true`** en el motor (el cobro C→I ya está ejecutado): hace falta al menos una fila **`pendiente` + `true`** en moneda de entrega (`monto_transaccion`), canónico en `sql/reglas_de_negocio_tabla.sql` y `sql/migracion_reglas_usd_ars_ars_usd_int_ci_pc_ep_egreso_pendiente_contrapartida_true.sql`. **ARS-USD** inversa: misma idea en **USD**. En `aplicarMotorCcDesdeReglasDeNegocio` (**`main.js`**) esa fila **no** vuelve a sumar CC cliente en moneda entregada: el **−me** ya salió del ingreso ejecutado (equiv. `sql/migracion_cc_modelo_reglas_usd_ars_ep_egreso_pendiente_linea1_mr_usd.sql`).
- **E,E (ambas transacciones ejecutadas), `ci_pc`:** en el ingreso con `ejecutada` + `contrapartida_ejecutada = true` hacen falta **−me ARS** y **−mr USD** en CC cliente (**sin** la tercera fila **+mr USD** que neteaba en la misma transacción: criterio transacciones independientes). El egreso P→C ejecutado con `true` aporta **linea 0** `+monto_transaccion` en **moneda entregada** y **linea 1** `+mr_prorrateado` en **moneda recibida** (espejo del bloque **sin** intermediario USD-ARS líneas 87–88). Migración ingreso: `sql/migracion_reglas_usd_ars_int_ee_ingreso_ejecutada_true_par_usd.sql`. Si la egreso linea 1 quedó en **−monto** en moneda entregada (error de neteo), **`sql/migracion_reglas_ci_pc_ee_egreso_linea1_mr_prorrateado_moneda_recibida.sql`** o reaplicar `sql/reglas_de_negocio_tabla.sql`.
- **P,E (ingreso pendiente + egreso ejecutado):** el compromiso a cobrar pendiente va en **+** (ARS y USD). Solo la fila de egreso con **`contrapartida_ejecutada = false`** debe llevar **−me** en ARS para anular; la fila con **`contrapartida_ejecutada = true`** sigue en **+me** (cierra contra el **−me** del `cobro_realizado` del ingreso ya ejecutado). Parche: `sql/migracion_reglas_int_ci_pc_compromiso_pago_anula_cobrar_pendiente.sql` y bloque ci_pc en `sql/reglas_de_negocio_tabla.sql`. **CC intermediario:** con ingreso C→I en **`pendiente` + `contrapartida_ejecutada = true`** debe figurar **+mr** en la moneda recibida del acuerdo («Compromiso a Cobrar»), igual criterio que P,P pero con `true` — `sql/reglas_de_negocio_tabla.sql` y `sql/migracion_reglas_usd_ars_ars_usd_int_ci_pc_pe_intermediario_ingreso_pendiente_true.sql`.
- **Varias entregas en moneda entregada** (misma orden: ej. egreso Pandy→Cliente en efectivo + egreso Intermediario→Cliente por transferencia): las filas **Pandy→Cliente** `ejecutada` / `compromiso_pago` deben usar **`monto_transaccion`**, no **`me`**, para no contar dos veces el total del acuerdo en CC cliente. Tabla canónica y parche idempotente: `sql/migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql`. Misma idea para cruces EUR clonados (`EUR-USD`, `USD-EUR`, `EUR-ARS`, `ARS-EUR`). En `main.js`, `ccTransaccionRefParaMovimientoMoneda` elige la transacción del mismo pagador/cobrador cuando hay varias filas en la misma moneda.
- **E,E `ci_pc` (detalle motor):** ver el bullet **«E,E (ambas transacciones ejecutadas), `ci_pc`»** un ítem arriba: `contrapartidaEjecutada` del egreso P→C es **true** cuando el ingreso C→I (o C→P) ya está ejecutado; el catálogo correcto de egreso es **linea 0 + linea 1** en **monedas distintas** (entregada / recibida con `mr_prorrateado`), no par ± en la misma moneda entregada.
- **ARS-USD** con intermediario: **`sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`** + **`docs/REG_NEG_ARS_USD_INT_PASO1.md`** (misma idea que USD-ARS+int con espejo de monedas).
- **Patrón `cp_ic`** (Cliente→Pandy + Intermediario→Cliente) para **USD-ARS+int:** filas en `sql/reglas_de_negocio_tabla.sql` (bloque USD-ARS true `cp_ic`). **E,E `cp_ic`:** par ± en **ingreso** C→Pandy en **USD** (`linea` 0 −1 y 1 +1, `monto_transaccion`, `contrapartida_ejecutada = true`), espejo del par ± en egreso Int→Cliente en **ARS**; sin la **linea 1** queda saldo fantasma en USD. Migración: **`sql/migracion_reglas_cp_ic_ingreso_ee_par_moneda_recibida.sql`**. Sigue sin línea **+mr** en el egreso Int→Cliente para netear **entre** transacciones; si la base tenía esa fila antigua, ejecutar **`sql/migracion_reglas_cc_int_transacciones_independientes_quitar_espejo_mr.sql`**.
- **P,E `cp_ic`, CC intermediario (egreso Int→Cliente ejecutado, ingreso C→P pendiente):** una sola regla **`entidad_cc = intermediario`**, `linea = 0`, **`signo = −1`**, `monto_transaccion`, moneda de la entrega (ARS en USD-ARS), **sin** par +/− que netee en cero — mismo criterio que **USD-USD+int**. Bases con el par antiguo: `sql/migracion_reglas_cp_ic_int_pe_intermediario_una_sola_linea_negativa.sql`. Cruces EUR+int espejados: reaplicar `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` o la migración (criterio genérico por columnas).
- **No** borra filas de `cc_modelo_reglas` (conviven hasta migración completa y E2E verdes).
- **No** cubre todavía el esquema “Pandy central” / 4 transacciones (CHEQUE-like): habrá más filas en un paso posterior.

## Próximo paso (paso 2)

- **Hecho en app:** `getReglasDeNegocio(codigo, usa_intermediario)` + `aplicarMotorCcDesdeReglasDeNegocio` con **`entidad_cc`** (cliente e intermediario); USD-ARS + int usa la tabla si hay filas.
- **Pendiente:** validar E2E y, cuando todo cierre, opcionalmente retirar duplicados de **`cc_modelo_reglas`** para USD-ARS + int.
- E2E: `npm run test:e2e-cc-02-03` o `tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js`.

## Referencia

- Corazón del sistema: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- Reglas generales: `docs/REGLAS_DE_NEGOCIO.md`
