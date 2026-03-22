# CHEQUE-ARS con intermediario — modelo y regla de oro

## Rol del tipo

- **Catálogo:** `tipos_operacion.codigo = 'CHEQUE-ARS'`, **`usa_intermediario = true`** por defecto (cheque en pesos + circuito cliente ↔ Pandy ↔ intermediario).
- **Monedas UI:** `moneda_in` / `moneda_out` típicamente **CHEQUE** y **ARS**; en `ordenes` se persisten montos en **ARS** (ver `docs/TIPOS_OPERACION_MONEDA_CHEQUE.md`).

## Regla de oro (fuente de verdad)

| Qué | Dónde |
|-----|--------|
| Movimientos CC (cliente e intermediario), signos, contrapartida, comisiones como filas de regla | **`reglas_de_negocio`** con **`tipo_operacion_codigo = 'CHEQUE-ARS'`** y **`usa_intermediario = true`** (`entidad_cc` cliente \| intermediario) |
| Interpretación: qué fila aplica a cada transacción y montos | **`main.js`**: `getReglasDeNegocio(codigo, usa_intermediario)` + **`aplicarMotorCcDesdeReglasDeNegocio`** (`lookupReglasDeNegocio`, `monto_efectivo_intermediario`, `condicion_estado_comision` para comisiones) |

- **`cc_modelo_reglas` no debe tener filas `CHEQUE-ARS`** (matriz “muerta” para ese código; el motor usa solo `reglas_de_negocio`). Si aparecieran filas viejas, ejecutar **`sql/migracion_reglas_de_negocio_cheque_ars.sql`** (UPSERT + `DELETE FROM cc_modelo_reglas WHERE tipo_operacion_codigo = 'CHEQUE-ARS'`).
- **`main.js`**: con filas en **`reglas_de_negocio`** para CHEQUE-ARS + int corre el motor; **el front ya no consulta `cc_modelo_reglas`** (tabla eliminable en Supabase: **`sql/migracion_drop_cc_modelo_reglas.sql`**).

## Comisiones implícitas

- **Pandy:** `monto_recibido − monto_entregado` del acuerdo (ARS), fila **`es_comision`** **Cliente→Pandy ingreso**; **`estadoEfectivoComision`** con **`par_cliente`** = ejecutada cuando **Tx1 o Tx2** está ejecutada (así con solo Tx1 ejecutada el neto cliente puede ser **−(mr − comisión) = −me**, p. ej. −200k + 5k = −195k).
- **Intermediario:** comisión por tasa sobre el circuito Pandy–intermediario; filas **`es_comision = true`**, **Pandy→Intermediario egreso**, con **`condicion_estado_comision`** (p. ej. `par_pandy_int`) donde aplique.
- Los importes concretos salen de la orden / `comisiones_orden` y del motor; la **forma** de cuándo suma y qué concepto usar está en **`reglas_de_negocio`** (filas `es_comision` + `condicion_estado_comision`).

## Instrumentación

- **Cuatro transacciones:** Tx1 Cliente→Pandy, Tx2 Pandy→Cliente, Tx3 Pandy→Intermediario, Tx4 Intermediario→Pandy (orden pagador al instrumentar: ver tests y `main.js`). Son la **coreografía acordada** al crear la instrumentación (momento cero), no “compensatorias” que el sistema invente al bajar un importe o al guardar.
- **Qué no es este modelo:** transacciones **automáticas** extra entre Pandy e intermediario generadas por la app al editar montos o al cerrar diferencias; eso es distinto de tener Tx3/Tx4 **definidas en la orden** como pasos reales del circuito.
- **Caja:** efectivo vs cheque (movimientos reales); coherencia con `docs/CONVENCION_MOVIMIENTOS_CAJA.md`.

## Scripts SQL recomendados (Supabase)

1. **Matriz en `reglas_de_negocio` y limpieza `cc_modelo`:** **`sql/migracion_reglas_de_negocio_cheque_ars.sql`**
2. Semilla catálogo: **`sql/seed_tipo_operacion_cheque_ars.sql`**
3. Tipos y checks de moneda (histórico): **`sql/migracion_cc_modelo_reglas_canonico_cheque_ars.sql`**
4. Bootstrap unificado: **`sql/reglas_de_negocio_tabla.sql`** (incluye CHEQUE-ARS con int) y **`sql/cc_modelo_reglas_tabla.sql`** (sin filas CHEQUE-ARS)

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
