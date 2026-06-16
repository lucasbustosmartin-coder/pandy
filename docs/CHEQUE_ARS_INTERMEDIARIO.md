# CHEQUE-ARS con intermediario — modelo y regla de oro

## Rol del tipo

- **Catálogo:** `tipos_operacion.codigo = 'CHEQUE-ARS'`, **`usa_intermediario = true`** por defecto (cheque en pesos + circuito cliente ↔ Pandy ↔ intermediario).
- **Monedas UI:** `moneda_in` / `moneda_out` típicamente **CHEQUE** y **ARS**; en `ordenes` se persisten montos en **ARS** (ver `docs/TIPOS_OPERACION_MONEDA_CHEQUE.md`).
- **Tasas % (cliente vs intermediario):** con modalidad **solo_pandy** o **legacy** (`cheque_ars_comision_modalidad` nulo): si la **tasa al cliente** es **&gt; 0**, la **tasa del intermediario** puede ser **0** (toda la comisión del acuerdo por tasa empresa / Pandy sobre el nominal). Si la tasa al cliente es **0** y hay intermediario, la tasa del intermediario sigue siendo obligatoria **&gt; 0**. Validación: `ordenMensajeErrorTasasChequeArsModalidad` en `main.js`.

## Regla de oro (fuente de verdad)

| Qué | Dónde |
|-----|--------|
| Movimientos CC (cliente e intermediario), signos, contrapartida, comisiones como filas de regla | **`reglas_de_negocio`** con **`tipo_operacion_codigo = 'CHEQUE-ARS'`** y **`usa_intermediario = true`** (`entidad_cc` cliente \| intermediario) |
| Interpretación: qué fila aplica a cada transacción y montos | **`main.js`**: `getReglasDeNegocio(codigo, usa_intermediario)` + **`aplicarMotorCcDesdeReglasDeNegocio`** (`lookupReglasDeNegocio`, `monto_efectivo_intermediario`, `condicion_estado_comision` para comisiones) |

- **`cc_modelo_reglas` no debe tener filas `CHEQUE-ARS`** (matriz “muerta” para ese código; el motor usa solo `reglas_de_negocio`). Si aparecieran filas viejas, ejecutar **`sql/migracion_reglas_de_negocio_cheque_ars.sql`** (UPSERT + `DELETE FROM cc_modelo_reglas WHERE tipo_operacion_codigo = 'CHEQUE-ARS'`).
- **`main.js`**: con filas en **`reglas_de_negocio`** para CHEQUE-ARS + int corre el motor; **el front ya no consulta `cc_modelo_reglas`** (tabla eliminable en Supabase: **`sql/migracion_drop_cc_modelo_reglas.sql`**).

## Comisiones implícitas

- **Par cliente P,P vs USD-USD / cruces + int:** el ajuste del motor `todoParClientePendienteConIntParaAlinearCcMotor` (compromiso de cobro vs egreso **+mr/−me**) **no aplica** a CHEQUE-ARS+int: aquí el ingreso pendiente cliente ya usa **`cobro_realizado`** con **−mr** en ARS y el egreso P→C **`monto_transacción`** (+me en una sola fila «Compromiso de Pago»), sin el patrón duplicado ni la inyección dual `+mr/−me/+me` del bloque **USD-USD ci_pc** en `aplicarMotorCcDesdeReglasDeNegocio`.
- **Pandy:** `monto_recibido − monto_entregado` del acuerdo (ARS), fila **`es_comision`** **Cliente→Pandy ingreso**; **`estadoEfectivoComision`** con **`par_cliente`** = ejecutada cuando **Tx1 o Tx2** está ejecutada (así con solo Tx1 ejecutada el neto cliente puede ser **−(mr − comisión) = −me**, p. ej. −200k + 5k = −195k).
- **Intermediario:** comisión por tasa sobre el circuito Pandy–intermediario; filas **`es_comision = true`**, **Pandy→Intermediario egreso**, con **`condicion_estado_comision`** (p. ej. `par_pandy_int`) donde aplique.
- Los importes concretos salen de la orden / `comisiones_orden` y del motor; la **forma** de cuándo suma y qué concepto usar está en **`reglas_de_negocio`** (filas `es_comision` + `condicion_estado_comision`).
- **Persistencia al guardar:** en cuanto la orden tiene instrumentación y comisiones configuradas, el sync CC inserta líneas de comisión (Pandy e intermediario) en estado **`pendiente`** si las patas que disparan la comisión aún no están ejecutadas; así quedan visibles para conciliación sin esperar a la primera ejecución. Usa plantilla de regla con `incluir_en_detalle` desde la fila canónica de par cerrado cuando la fila `pendiente` pura no la trae (`reglaComisionMotorPlantillaDetalle` en `main.js`; mismo criterio para USD-USD, cruces con int., etc.).

### CC cliente — «Comisión del acuerdo» (+spread) y detalle Movimientos

- **Monto en libro:** la fila sintética sin `transaccion_id` lleva el **spread del acuerdo** `monto_recibido − monto_entregado` en **positivo** (haber del cliente frente al cobro/compromiso), **sin** aplicar el `signo` negativo de la fila `es_comision` en `reglas_de_negocio` (ese signo es convención contable del movimiento ingreso C→P; en CC acuerdo el spread debe verse como **+**). Implementación: `aplicarMotorCcDesdeReglasDeNegocio` en `main.js` (bloque CHEQUE-ARS). Si en la orden **`monto_recibido ≤ monto_entregado`** (datos viejos o desalineados) pero el par **ejecutado** ingreso C→P + egreso P→C en monR existe con `monto_recibido > Σ montos ingreso`, se usa **`monto_recibido − Σ ingresos`** — mismo hueco que entre «Compromiso de Pago» (+monto trx) y «Cobro Realizado» (−`mr`). Helper: `spreadChequeArsClienteNetoDesdeOrdenYParTrx` en `main.js`. En **sync** y en el **motor**, el spread que alimenta la sintética y el refuerzo pre-dedupe usa además **`max(…, monto_recibido nominal − monto_entregado)`** cuando la cabecera ya refleja MonR−MonE y el cálculo solo desde transacciones diera 0.
- **Tasa del intermediario (no confundir con tasa al cliente):** `ordenes.tasa_descuento_intermediario` es canónico en **fracción** 0..1; import o legado puede traer **2,5** como porcentaje. Sin normalizar, checks del estilo `tasa < 1` **no** aplican `mr × tasa` a la comisión intermediario ni `mr × (1 − tasa)` al efectivo int. — efecto similar a usar tasa cliente **0** por error. Unificación: `tasaDescuentoIntermediarioFraccionSync` en `main.js` (sync, plantilla de 4 transacciones, `contribucionSaldoIntermediarioModeloCc`, inserts CC al ejecutar Tx4, etc.).
- **Visible en la pestaña Movimientos:** el listado filtra con `m.incluir_en_detalle === false` → **no** muestra la fila. Por eso la línea sintética de comisión **cliente** CHEQUE-ARS se persiste con **`incluir_en_detalle: true` fijo** (no se hereda `false` de la regla `es_comision`, que en algunas migraciones viene en `false` para otros usos). Detalle: `continuarFetchMovimientosCcCore` / armado de `detalleList` en `main.js`.
- **Refuerzo desde `comisiones_orden` (post-dedupe):** si ya hay filas persistidas (beneficiario **pandy** y/o **intermediario**) con monto en la moneda recibida del acuerdo y **aún no** existe la sintética «Comisión del acuerdo» en CC cliente, `inyectarFilaComisionAcuerdoCcClienteDesdeComisionesOrdenSiFaltaChequeArs` inserta la línea (+) usando el máximo entre spread sync, cabecera `mr−me`, spread por transacciones y la suma en tabla — sin depender solo del motor.
- **Refuerzo pre-dedupe (motor CC activo):** si hay `reglas_de_negocio` para CHEQUE-ARS corre `aplicarMotorCcDesdeReglasDeNegocio` (`usarMotorEfectivo`). El fallback de `aplicarSyncUnicoChequeArs('pre_dedupe', …)` **solo** cubre el camino sin motor completo. **Invariante:** se eliminó el bypass solo-CHEQUE en `validarInvarianteNeteoCcClienteAcuerdoCerrado` (ronda previa). Si `omitirInvarianteNeteoCcClienteAcuerdoCerrado` (MC o desvío plantilla) es true, **igual** corre el bucle de neteo cuando `exigirBucleNeteoCcClienteChequeArsIntAunqueOmitirInvariante` (CHEQUE+int., misma fiat catálogo, mr>me, instrumentación toda ejecutada strict, par cliente cerrado). Antes del invariante, `garantizarFilaComisionSpreadChequeArsClienteCabeceraMrMeSiFalta` se invoca otra vez sobre el payload deduplicado. La sintética entra en el residual vía `sumaMovimientosComisionAcuerdoSinteticaExentosNeteo` (moneda catálogo por fila). Con motor activo se reinyecta **solo** la fila cliente si falta en pre-dedupe (`ccClienteTieneFilaComisionDelAcuerdoSintetica`); CC intermediario y caja del fallback siguen limitados al camino **sin** motor completo para no duplicar líneas int.
- **Refuerzo post-dedupe:** `asegurarFilaComisionSpreadChequeArsClienteSiFalta` vuelve a insertar la fila si faltaba (MC + `soloComisiones`, códigos de tipo desalineados, etc.); antes elimina sintéticas «Comisión del acuerdo» sin `transaccion_id` con monto **&lt; 1e-6** (p. ej. legado con signo mal armado). Si ya existe sintética **+** pero quedó con `incluir_en_detalle: false` (sync viejo), la fuerza a **`true`** para que aparezca en Movimientos.
- **Residual en monR:** si tras eso la suma de filas CC cliente de la orden en **moneda recibida** sigue **&lt; −1** (a favor de Pandy) y no hay sintética de comisión con |monto| útil, `inyectarComisionChequeArsClienteSiResidualMonR` inserta **+ (−suma)** para netear (último recurso frente a desalineación motor/MC vs `mr`/`me` o montos de transacción). La suma incluye **todas** las filas del payload con ese `orden_id` y moneda (no solo `orden.cliente_id`: MC/vínculo puede usar otro UUID) y usa `monto` o, si falta, `monto_ars`/`monto_usd`/`monto_eur` según la moneda de la fila. Tipo: matriz `CHEQUE-ARS` **o** cheque misma moneda acuerdo vía `esTipoOperacionChequeArs` cuando el catálogo no matchea la matriz estricta.

### Flip pagador/cobrador (solo CHEQUE-ARS + intermediario)

- **Durante el desvío:** si pagador/cobrador de alguna transacción difiere de la plantilla estándar, el sync usa **multicontraparte en memoria** (`derivMcAutoChequeArsIntDesvioPagCob`), **sin** persistir `multicontraparte_manual` en BD (paridad con USD-USD `cp_ic` + instrumentación ajustada manual). Las patas CC salen de `aplicarCcMulticontraparteManualConciliacionCompleta` + motor en modo `soloComisiones`.
- **Comisión sintética durante desvío:** mientras `chequeArsIntOmitirComisionSinteticaClienteMcDesvioPagCob` es true, **no** se inyecta la fila «Comisión del acuerdo» (+`mr−me`): las patas MC ya reflejan mr/me; sumar +spread falseaba el saldo (p. ej. egreso P→C flip a C→P mostraba favor empresa `me − spread` en vez de `me`). Con compensación flip ingreso (`compensacion_cc_monto_aplicado`) rige la rama aparte (no aplica este omit).
- **Al revertir plantilla:** si la instrumentación vuelve a coincidir con la plantilla y no hay compensación persistida, `desactivarMcAutoPersistidoChequeArs` limpia `multicontraparte_manual` legado (órdenes afectadas antes del fix) y el sync vuelve al **motor canónico** (`reglas_de_negocio`): Cobro −mr, Compromiso +me, Comisión +spread, neto 0.
- **Flip pata cheque Pandy↔Intermediario (Tx3, monto nominal mr):** si pagador/cobrador se invierten respecto de la plantilla (p. ej. egreso Intermediario→Pandy en vez de Pandy→Intermediario), la CC del **intermediario** debe quedar como entrega de cheque canónica: **+mr** «Pago realizado» y **−comisión intermediario** (p. ej. +35.000.000 y −875.000 → deuda neta 34.125.000 a favor de Pandy). Helpers: `chequeArsIntTrxEsFlipPagCobPataTx3PandyInterCheque`, `inyectarCcIntChequeArsPagoRealizadoNominalFlipPataPandyInter`, `estadoEfectivoComisionChequeArsParPandyInt` (solo CHEQUE-ARS; MC genérico no aplica −mr al pagador int.).
- **Flip pata efectivo Tx4 (plantilla ingreso Intermediario→Pandy):** si se invierte a **Pandy→Intermediario** (la empresa paga esa pata en lugar de cobrar el efectivo del intermediario), **no** debe generarse un «Cobro realizado» +34.125.000 (ni +me) en CC int. por esa transacción: la deuda neta queda **+mr − comisión intermediario** (34.125.000 con mr=35M y comisión 875K) vía **Tx3 canónica** (+mr «Pago realizado») + sintética **−comisión**. Helper: `chequeArsIntTrxEsFlipPagCobPataTx4PandyInterEfectivo`; Tx3 canónica en MC: `chequeArsIntTrxEsCanonicaTx3PandyInterChequeEgreso` + `inyectarCcIntChequeArsPagoRealizadoNominalPataPandyInter`.
- **Otros tipos:** USD-USD, USD-ARS, ARS-USD y demás **no** cambian: siguen persistiendo MC auto en desvío pag/cob cuando corresponde.

### CC intermediario — comisión 100 % intermediario (fila **−comisión** obligatoria)

- Cuando **no** hay parte Pandy en `comisiones_orden` (`comisionPandyMonto` ≈ 0) y **toda** la comisión es del intermediario, las líneas de par **Tx3** (+ nominal del cheque / pago realizado) y **Tx4** (−efectivo `me`) suman **+mr − me = +spread** en `movimientos_cuenta_corriente_intermediario`: el spread **no** queda “implícito” en esas dos filas para netear el libro. Hace falta la fila sintética **«Comisión del acuerdo»** en **−|comisión|** (misma magnitud que el spread cuando solo hay comisión intermediario) para que la CC del intermediario **netee en cero** por orden. La fila **+spread** en CC **cliente** es independiente (neteo del acuerdo con el cliente).
- Helper: `chequeArsCcIntOmitirComisionAcuerdoSinteticaTodoInter` en `main.js` quedó como **no-op** (siempre **no** omitir): motor, fallback sync y `insertarFilasComisionIntermediarioCcPorTransaccion` **persisten** la línea −comisión en CC intermediario cuando corresponde.

## Signos en CC del intermediario (CHEQUE-ARS + int)

Convención alineada a la **cuenta corriente de Pandy** (qué le debe el intermediario en la cadena del cheque):

| Movimiento | Signo en `movimientos_cuenta_corriente_intermediario` | Lectura |
|------------|------------------------------------------------------|---------|
| **Pago realizado** (Tx3: Pandy entrega el cheque al intermediario) | **+** monto del cheque | El intermediario “recibe” el pasivo de liquidar ese valor con Pandy. |
| **Comisión del acuerdo** (parte del intermediario) | **−** importe de comisión | Lo que el intermediario reconoce a favor de Pandy por tasa/spread *además* del par Tx3/Tx4. Con comisión **100 % intermediario** también se persiste esta fila para netear +spread residual entre Tx3 y Tx4 (ver § arriba). |
| **Cobro realizado** (Tx4: intermediario entrega efectivo a Pandy) | **−** monto efectivo | Reduce la deuda neta; con el par cerrado la suma de las líneas relevantes debe dar **0**. |

Mientras **Tx4 sigue pendiente** y **Tx3** (u otra contraparte del par Pandy–intermediario) **no** está ejecutada, `contrapartida_ejecutada` es **false** para esa ingreso: hace falta una fila en `reglas_de_negocio` con `estado_transaccion = pendiente` y `contrapartida_ejecutada = false` (además de la fila con `true` cuando ya matchea el par). Canónico en `sql/reglas_de_negocio_tabla.sql`; parche: `sql/migracion_reglas_pendiente_contrapartida_false_usd_usd_int_y_cheque_tx4.sql`.

**Instrumentación automática (4 tx en pendiente):** el motor necesita filas `estado_transaccion = pendiente` también para **Tx1** (Cliente→Pandy) y **Tx2** (Pandy→Cliente) en `entidad_cc = cliente`, para **Tx3** (Pandy→Intermediario) con `pendiente` y `contrapartida_ejecutada` **false** y **true**, y para **Tx4** (Intermediario→Pandy ingreso, `monto_efectivo_intermediario`) con `pendiente` y `contrapartida_ejecutada` **false** y **true**. Sin ellas, al sincronizar CC puede aparecer el toast «sin regla» o quedar movimientos sin la pata **Trans. 4**. Parche unificado: **`sql/migracion_reglas_cheque_ars_int_tx1_tx2_tx3_pendiente.sql`** (incluye Tx4 desde 2026-04); si ya corriste una versión vieja de ese archivo sin Tx4: **`sql/migracion_reglas_cheque_ars_int_tx4_pendiente.sql`**. Canónico: **`sql/reglas_de_negocio_tabla.sql`**.

Ejemplo: cheque 25.000 ARS, comisión int 375 ARS, efectivo a devolver 24.625 ARS → líneas **+25.000**, **−375** y, al ejecutar Tx4, **−24.625**; saldo neto **0**.

En el **resumen** CC, el test E2E sigue interpretando el saldo del intermediario con la lógica `saldoResumenANumero(..., true)` (lectura coherente con deuda neta aunque la celda muestre signo “positivo” en verde).

## Instrumentación

- **Cuatro transacciones:** Tx1 Cliente→Pandy, Tx2 Pandy→Cliente, Tx3 Pandy→Intermediario, Tx4 Intermediario→Pandy (orden pagador al instrumentar: ver tests y `main.js`). Son la **coreografía acordada** al crear la instrumentación (momento cero), no “compensatorias” que el sistema invente al bajar un importe o al guardar.
- **Qué no es este modelo:** transacciones **automáticas** extra entre Pandy e intermediario generadas por la app al editar montos o al cerrar diferencias; eso es distinto de tener Tx3/Tx4 **definidas en la orden** como pasos reales del circuito.
- **Caja:** efectivo vs cheque (movimientos reales); coherencia con `docs/CONVENCION_MOVIMIENTOS_CAJA.md`. La fila de **caja por orden** asociada a **«Comisión del acuerdo»** (parte intermediario) en matriz **CHEQUE-ARS** se registra siempre como **transferencia bancaria** (`caja_tipo` **banco**; sync y `asegurarComisionIntermediario`), no en efectivo ni en bolsa cheque.

## Scripts SQL recomendados (Supabase)

1. **Matriz en `reglas_de_negocio` y limpieza `cc_modelo`:** **`sql/migracion_reglas_de_negocio_cheque_ars.sql`**
2. **Pendiente Tx1–Tx4 (cliente Tx1–Tx2, intermediario Tx3–Tx4, `contrapartida_ejecutada` false/true según matriz):** **`sql/migracion_reglas_cheque_ars_int_tx1_tx2_tx3_pendiente.sql`** (motor CC; si tu copia no incluye Tx4, **`sql/migracion_reglas_cheque_ars_int_tx4_pendiente.sql`**).
3. **Solo signos CC intermediario (DB ya cargada):** **`sql/migracion_reglas_cheque_ars_signos_cc_intermediario.sql`**
4. Semilla catálogo: **`sql/seed_tipo_operacion_cheque_ars.sql`**
5. Tipos y checks de moneda (histórico): **`sql/migracion_cc_modelo_reglas_canonico_cheque_ars.sql`**
6. Bootstrap unificado: **`sql/reglas_de_negocio_tabla.sql`** (incluye CHEQUE-ARS con int) y **`sql/cc_modelo_reglas_tabla.sql`** (sin filas CHEQUE-ARS)

Orden práctico: según `docs/TESTING_E2E_GUIA.md` §1.5–1.7 (RPC `sync_cc_caja_orden` al día).

## Tests E2E

- **12 combinaciones** Tx1..Tx4: **`tests/e2e/01-cc-combinaciones.spec.js`**
- Expectativas: **`tests/e2e/cc-combinaciones-esperado.js`** (montos fijos 200k / 195k / 197k / 5k / 3k)
- Una combinación: `COMBINACION_ID="E,P,E,P" npx playwright test tests/e2e/01-cc-combinaciones.spec.js`
- NPM: **`npm run test:e2e-cc-cheque-ars`**

## Referencias cruzadas

- `docs/TIPOS_OPERACION_MONEDA_CHEQUE.md` — UI y equivalencia con ARS-ARS
- `docs/CC_MODELO_TABLA_REGLAS.md` — semántica de columnas `cc_modelo_reglas`
- `docs/REGLAS_DE_NEGOCIO.md` — qué va en `reglas_de_negocio` vs `cc_modelo_reglas`
