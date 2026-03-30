# USD-USD con intermediario

> **Ámbito ampliado (app):** el bloque **“Instrumentación sugerida (con intermediario)”** en el modal de orden (radios `cp_ic` / `ci_pc`) y el autocompletado de **2 transacciones** con el mismo patrón aplican a **cualquier tipo con `usa_intermediario`**, salvo **CHEQUE-ARS** (cuatro transacciones fijas). Incluye **ARS-USD** y **USD-ARS** con intermediario: `tipo_cambio` en la pata que corresponde (como sin intermediario). La **CC** sigue gobernada por `reglas_de_negocio` por código de tipo; este doc sigue centrado en **USD-USD**.

## Resumen

- **Tipo de operación:** segunda fila en `tipos_operacion` con `codigo = 'USD-USD'` y `usa_intermediario = true` (selector “con intermediario” en la orden).
- **CC:** única fuente **`reglas_de_negocio`** (`usa_intermediario = true`). **Instrumentación (dos patrones):** (A) ingreso **Cliente→Pandy** + egreso **Intermediario→Cliente**; (B) ingreso **Cliente→Intermediario** + egreso **Pandy→Cliente**. Las reglas cubren `pagador`/`cobrador` de ambos; se mantienen filas legacy **Pandy→Cliente** en egreso para órdenes antiguas.
- **Comisión total del acuerdo:** sigue siendo **mr − me** (implícita en la orden). En **CC cliente**, la fila `es_comision` usa **`monto_origen = mr_menos_me`** (igual que sin int): el cliente ve el **spread completo** a favor de Pandy.
- **Reparto:** `comisiones_orden` guarda el reparto (**Pandy** / **intermediario**) según los % en el wizard. La parte del intermediario se refleja en **CC intermediario** con una fila **`es_comision`**, `pagador`/`cobrador` **Pandy → Intermediario**, **`monto_origen = comision_intermediario`**. En la tabla, **`signo = −1`** modela **cp_ic** (Pandy debe la comisión al intermediario). En patrón **ci_pc**, `main.js` **invierte** el signo de esa fila (la comisión queda a favor del intermediario en CC, coherente con que el cobro al cliente lo hizo el int. y Pandy pagó **me** al cliente).
- **Patrón cp_ic (Cliente→Pandy + Intermediario→Cliente):** en **CC intermediario** entra el **me** entregado por el intermediario al cliente como deuda de Pandy hacia el int. (una línea **−me** por transacción cuando el egreso Int→Cliente está ejecutado; si el ingreso C→P sigue pendiente, no se usa el par +/− que anulaba el efecto). La **comisión explícita** del int. (`comisiones_orden`) se devenga con el par cliente cerrado **o** en **P,E** (ya entregó Int→Cliente; cobro C→P pendiente): regla `es_comision` con `contrapartida_ejecutada = false` en `reglas_de_negocio` + lógica en `main.js` (`egresoIntermediarioAClienteEjecutado`). El saldo neto es **−(me + comisión int.)** en la convención de resumen (Pandy debe al intermediario).
- **Patrón ci_pc (Cliente→Intermediario + Pandy→Cliente):** en **USD-USD+int**, en **CC intermediario** entran movimientos por el egreso **Pandy→Cliente** (`entidad_cc = intermediario`, reglas espejo de la entidad cliente en esa pata; par cerrado → **+me** en resumen) más la fila de comisión con signo invertido en el motor (ver arriba). **Caja:** solo el egreso Pandy→Cliente mueve caja (−me). En **cruces** (USD-ARS / ARS-USD +int) la CC intermediario en ci_pc se modela con el ingreso **Cliente→Intermediario** y las reglas existentes (no se duplica el egreso en la otra moneda en CC int., para no romper saldos por moneda).
- **Motor:** `main.js` activa `usarMotorReglasNegocioUsdUsdInt` cuando el tipo es USD-USD, hay intermediario y existen filas en `reglas_de_negocio`. `aplicarMotorCcDesdeReglasDeNegocio` inserta la fila **cliente** `es_comision` / `mr_menos_me` cuando **mr > me** (acuerdo en la orden) y el **par cliente** está cerrado (ingreso C→P ejecutado + egreso a cliente ejecutado, sea Pandy o intermediario pagador); el monto sigue la **tabla** `reglas_de_negocio`, no depende de que exista fila en `comisiones_orden` para “habilitar” esa línea. `comisiones_orden` es la fuente del **reparto** y de la fila **intermediario** (`comision_intermediario`; par cliente cerrado).
- **Autocompletado y caja:** con lista vacía, `autoCompletarInstrumentacionUsdUsdConIntermediario` crea las dos transacciones según el patrón elegido en el paso **Detalles** del modal (`cp_ic` = A, `ci_pc` = B). **Caja de Pandy:** el ingreso **Cliente→Intermediario** (ejecutado) **no** genera movimiento de caja — el efectivo lo cobra el intermediario. Con patrón **cp_ic**, el egreso **Intermediario→Cliente** ejecutado **tampoco** mueve la caja de Pandy (el efectivo lo entrega el intermediario; no es billete que cuente la caja de la casa). Solo entran movimientos de caja cuando **participa Pandy** como pagador o cobrador en la transacción ejecutada (p. ej. ingreso **Cliente→Pandy** +mr; en **ci_pc**, egreso **Pandy→Cliente** −me). Ver `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`.
- **Modal orden:** si el tipo tiene `usa_intermediario = true`, es **obligatorio** elegir intermediario (Continuar + **Guardar** / Ir a instrumentación). La etiqueta del selector pasa a **Intermediario \***. Al reabrir una orden con 2 transacciones, los radios se alinean al patrón detectado (primera fila ingreso a intermediario → B). **CHEQUE-ARS:** no se muestran estos radios (instrumentación de 4 transacciones).

## SQL

**Supabase (producción o base ya en uso):** en el SQL Editor ejecutá **solo**  
**`sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql`**  
(de principio a fin). Ahí van el parche cp_ic, comisión USD-USD+int, paso **2b** (ci_pc CC intermediario Pandy→Cliente en USD-USD+int) y la regeneración **EUR-USD / USD-EUR / EUR-ARS / ARS-EUR** con intermediario. No hace falta ni conviene correr otros `.sql` sueltos para esto. Detalle: `docs/reglas_de_negocio_rows_README.md`.

**Instalación desde cero del catálogo de reglas:** **`sql/reglas_de_negocio_tabla.sql`**.

*Migraciones sueltas en `sql/` (p. ej. `migracion_usd_usd_intermediario_*`, `migracion_reglas_ci_pc_cc_intermediario_pandy_cliente.sql`): histórico o fragmentos ya absorbidos por el script único; **no los ejecutes por separado** salvo que estés reconstruyendo manualmente un entorno y sepas exactamente qué falta.*

## Tests

- E2E: **`tests/e2e/91-orden-cc.spec.js`** — bloque “Orden USD-USD con intermediario…”.
- Comando: **`npm run test:e2e-cc-usd-usd-int`** (filtra el test por nombre en `91-orden-cc.spec.js`).

## Referencias

- Sin intermediario: **`docs/USD_USD_SIN_INTERMEDIARIO.md`**
- Tabla y `monto_origen`: **`docs/REGLAS_DE_NEGOCIO.md`**
