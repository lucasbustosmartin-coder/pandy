# USD-USD con intermediario

> **Ámbito ampliado (app):** el bloque **“Instrumentación sugerida (con intermediario)”** en el modal de orden (radios `cp_ic` / `ci_pc`) y el autocompletado de **2 transacciones** con el mismo patrón aplican a **cualquier tipo con `usa_intermediario`**, salvo **CHEQUE-ARS** (cuatro transacciones fijas). Incluye **ARS-USD** y **USD-ARS** con intermediario: `tipo_cambio` en la pata que corresponde (como sin intermediario). La **CC** sigue gobernada por `reglas_de_negocio` por código de tipo; este doc sigue centrado en **USD-USD**.

## Resumen

- **Tipo de operación:** segunda fila en `tipos_operacion` con `codigo = 'USD-USD'` y `usa_intermediario = true` (selector “con intermediario” en la orden).
- **CC:** única fuente **`reglas_de_negocio`** (`usa_intermediario = true`). **Instrumentación (dos patrones):** (A) ingreso **Cliente→Pandy** + egreso **Intermediario→Cliente**; (B) ingreso **Cliente→Intermediario** + egreso **Pandy→Cliente**. Las reglas cubren `pagador`/`cobrador` de ambos; se mantienen filas legacy **Pandy→Cliente** en egreso para órdenes antiguas.
- **Comisión total del acuerdo:** sigue siendo **mr − me** (implícita en la orden). En **CC cliente**, la fila `es_comision` usa **`monto_origen = mr_menos_me`** (igual que sin int): el cliente ve el **spread completo** a favor de Pandy.
- **Reparto:** `comisiones_orden` guarda el reparto (**Pandy** / **intermediario**) según los % en el wizard. La parte del intermediario se refleja en **CC intermediario** con una fila **`es_comision`**, `pagador`/`cobrador` **Pandy → Intermediario**, **`monto_origen = comision_intermediario`** (monto tomado de `comisiones_orden`, beneficiario intermediario).
- **Motor:** `main.js` activa `usarMotorReglasNegocioUsdUsdInt` cuando el tipo es USD-USD, hay intermediario y existen filas en `reglas_de_negocio`. `aplicarMotorCcDesdeReglasDeNegocio` inserta la fila **cliente** `es_comision` / `mr_menos_me` cuando **mr > me** (acuerdo en la orden) y el **par cliente** está cerrado (ingreso C→P ejecutado + egreso a cliente ejecutado, sea Pandy o intermediario pagador); el monto sigue la **tabla** `reglas_de_negocio`, no depende de que exista fila en `comisiones_orden` para “habilitar” esa línea. `comisiones_orden` es la fuente del **reparto** y de la fila **intermediario** (`comision_intermediario`; par cliente cerrado).
- **Autocompletado y caja:** con lista vacía, `autoCompletarInstrumentacionUsdUsdConIntermediario` crea las dos transacciones según el patrón elegido en el paso **Detalles** del modal (`cp_ic` = A, `ci_pc` = B). **Caja de Pandy:** el ingreso **Cliente→Intermediario** (ejecutado) **no** genera movimiento de caja — el efectivo lo cobra el intermediario. Sigue aplicando **−me** cuando la entrega al cliente es **Intermediario→Cliente** ejecutada (misma convención que egreso con Pandy en la pata). Ingreso **Cliente→Pandy** y egreso **Pandy→Cliente** siguen la regla “caja solo si participa Pandy” (`sincronizarCcYCajaDesdeOrden`).
- **Modal orden:** si el tipo tiene `usa_intermediario = true`, es **obligatorio** elegir intermediario (Continuar + **Guardar** / Ir a instrumentación). La etiqueta del selector pasa a **Intermediario \***. Al reabrir una orden con 2 transacciones, los radios se alinean al patrón detectado (primera fila ingreso a intermediario → B). **CHEQUE-ARS:** no se muestran estos radios (instrumentación de 4 transacciones).

## SQL

- **`sql/migracion_usd_usd_intermediario_tipo_y_reglas.sql`** — catálogo, CHECK `comision_intermediario`, clonado de reglas sin int + fila intermediario, limpieza `cc_modelo_reglas`.
- **`sql/migracion_reglas_usd_usd_int_egreso_intermediario_cliente.sql`** — UPSERT de egreso Intermediario→Cliente.
- **`sql/migracion_reglas_usd_usd_int_ingreso_cliente_intermediario.sql`** — UPSERT de ingreso Cliente→Intermediario.
- Instalación desde cero: **`sql/reglas_de_negocio_tabla.sql`** (incluye bloque USD-USD `usa_intermediario = true`).

## Tests

- E2E: **`tests/e2e/91-orden-cc.spec.js`** — bloque “Orden USD-USD con intermediario…”.
- Comando: **`npm run test:e2e-cc-usd-usd-int`** (filtra el test por nombre en `91-orden-cc.spec.js`).

## Referencias

- Sin intermediario: **`docs/USD_USD_SIN_INTERMEDIARIO.md`**
- Tabla y `monto_origen`: **`docs/REGLAS_DE_NEGOCIO.md`**
