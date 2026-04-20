# Guía: tests E2E con Playwright (opción B)

Esta guía indica **qué tenés que hacer vos** para que los tests automatizados funcionen y cómo usarlos.

### Tests unitarios locales (sin Playwright ni Supabase)

Para la política de **compensación CC** al invertir un ingreso Cliente→Pandy a Pandy→Cliente (USD-USD con intermediario, sin multicontraparte manual), el repo incluye tests mínimos que documentan el tope `Math.min(monto, -saldo)` y la suma exenta del invariante de neteo:

```bash
npm run test:unit-cc-flip
```

Paridad de criterio **comisión G/P** (texto vs `clasificacion_movimiento` ENUM, alineado a `migracion_gp_operativa_panel.sql`):

```bash
npm run test:unit-clasificacion-gp
```

Inferencia **sync CC/caja** y payload transacción (réplica de `main.js` antes de `sync_cc_caja_orden`; mantener alineado al cambiar reglas):

```bash
npm run test:unit-clasificacion
```

Ese último comando incluye **GP + inferencia** (todos los tests de `tests/unit/clasificacion-*.test.mjs`). No requieren `.env.test` ni app levantada.

### Smoke G/P **solo lectura** (producción u otro proyecto con datos)

Los E2E de Playwright usan **Supabase de desarrollo** y suelen partir de base casi vacía: **no validan** bien el agregado G/P contra un libro grande. Para comprobar **sin alterar datos** que las RPC de panel siguen sanas en **producción** (o en cualquier proyecto con volumen real), el repo incluye un script que **solo** llama a `gp_operativa_resumen` (y opcionalmente `gp_operativa_detalle` en la bolsa `caja_manual`):

```bash
npm run smoke:gp-operativa-readonly
```

**Qué hace:** lectura vía RPC (`STABLE`); **no** inserta, actualiza ni borra filas; **no** llama a `rpc_limpiar_base_e2e` ni a sync.

**Pasos (zsh / bash; copiá una línea por vez, sin comentarios de markdown):**

1. Crear el archivo local (no se sube a git):

```bash
cp .env.smoke-prod-readonly.example .env.smoke-prod-readonly
```

2. Abrí `.env.smoke-prod-readonly` en el editor y completá **solo** `SMOKE_GP_SUPABASE_URL` y `SMOKE_GP_SUPABASE_SERVICE_ROLE_KEY` del proyecto que querés (misma URL y clave del mismo proyecto). Dejá `SMOKE_GP_READONLY_CONFIRM=yes` como está en el ejemplo: así **no hace falta** `export` en la terminal.

3. Ejecutá de nuevo:

```bash
npm run smoke:gp-operativa-readonly
```

**Si ves `zsh: no matches found`:** pegaste en la terminal líneas con asteriscos dobles (`**`) típicos de Markdown, o un comentario sin `#` al inicio. No pegues párrafos de la guía en la consola; solo los comandos de arriba o editá el `.env` a mano.

**Si ves `export: not valid in this context`:** no pegues la frase “o dejalo en el .env” junto con `export`; o bien usá solo el archivo `.env.smoke-prod-readonly` (recomendado), o en terminal solo:

```bash
export SMOKE_GP_READONLY_CONFIRM=yes
```

(sin nada después en la misma línea).

**Opcionales (en el mismo `.env`):** `SMOKE_GP_DESDE` y `SMOKE_GP_HASTA` (YYYY-MM-DD, UTC). `SMOKE_GP_INCLUDE_DETALLE=1` para también invocar `gp_operativa_detalle` (bolsa `caja_manual`).

**Límites:** no reemplaza una auditoría contable; solo verifica que las RPC responden y que el JSON de resumen trae las **siete** claves (`caja_manual`, `caja_ordenes`, `cc_cliente`, `cc_intermediario`, `cc_resultado_economico_compensatorio`, `comisiones_acuerdo_pandy`, `comisiones_acuerdo_intermediario`). Si el proyecto **no** tiene aún desplegado el panel G/P con séptima bolsa, el smoke fallará en la comprobación de claves hasta alinear `migracion_gp_operativa_panel.sql` en esa base. Con `SMOKE_GP_INCLUDE_DETALLE=1`, `gp_operativa_detalle` debe existir y responder (si la función en servidor es vieja y falla con 42P01, aplicar el `migracion_gp_operativa_detalle.sql` actual del repo en **ese** proyecto Supabase). Si el período es enorme en prod, acotá fechas para aligerar la consulta.

Script: `scripts/smoke-gp-operativa-readonly.mjs`.

---

## 1. Lo que tenés que hacer una sola vez

### 1.1 Instalar dependencias de tests

En la raíz del proyecto:

```bash
npm install
npx playwright install
```

El primer comando instala Playwright como devDependency; el segundo descarga los navegadores (Chromium, etc.) para tu sistema operativo. Si los tests dicen "Executable doesn't exist", volvé a ejecutar `npx playwright install`.

La vista Cuenta corriente hace varias consultas (movimientos, transacciones, instrumentación) antes de mostrar el resumen; los tests tienen timeouts de 45 s para que termine de cargar y 15 s para la primera fila de la tabla.

### 1.2 Crear el archivo de credenciales de prueba

**No subas nunca usuario ni contraseña al repo.** Los tests leen las credenciales de un archivo local.

1. En la raíz del proyecto, copiá el ejemplo:
   ```bash
   cp .env.test.example .env.test
   ```
2. Editá `.env.test` y completá:
   - `TEST_BASE_URL`: URL donde corre la app al probar. Si probás en tu máquina con `npm run dev`, usá `http://localhost:5173` (o el puerto que te muestre Vite).
   - `TEST_USER_EMAIL`: email del usuario con el que querés que los tests hagan login (debe existir en **Auth del proyecto de desarrollo**, no en producción).
   - `TEST_USER_PASSWORD`: contraseña de ese usuario.
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: **obligatorios** para la limpieza automática; deben ser del **mismo proyecto Supabase de desarrollo** que `config.js` / `.env` (Pandy-Dev). **No uses el proyecto de producción** (truncarías datos reales). Tras `npm run dev:supabase:volcar`, el script suele dejar estas dos claves ya alineadas en `.env.test`.

Ejemplo de `.env.test` (valores ilustrativos):

```
TEST_BASE_URL=http://localhost:5173
TEST_USER_EMAIL=tu-usuario-de-prueba@ejemplo.com
TEST_USER_PASSWORD=tu_contraseña_secreta
SUPABASE_URL=https://tu-ref-desarrollo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=(service role del mismo proyecto)
```

El archivo `.env.test` ya está en `.gitignore`; no se sube al repositorio.

### 1.3 Tener la app levantada cuando corras los tests

Los tests abren la URL que configuraste (por ejemplo `http://localhost:5173`). Esa app debe estar corriendo y usando **el mismo proyecto de Supabase (desarrollo)** que tu `config.js` y las claves `SUPABASE_*` de `.env.test` (misma URL; la service role solo en Node para limpiar la base).

- Para probar en local: en una terminal dejá corriendo `npm run dev` y en otra ejecutá los tests.
- Si Vite dice "Port 5173 is in use, trying another one..." y arranca en otro puerto (ej. 5174), poné en `.env.test`: `TEST_BASE_URL=http://localhost:5174` (o el puerto que muestre Vite). Si no, los tests intentan abrir 5173 y fallan con `net::ERR_CONNECTION_REFUSED`.
- Si más adelante tenés una URL de staging, podés poner esa en `TEST_BASE_URL` y no hace falta levantar nada en tu máquina.

### 1.4 Base limpia para tests de Órdenes y CC (ambiente de desarrollo)

Los tests de **Órdenes y Cuenta corriente** crean órdenes y comprueban saldos. Para no acumular suciedad en la base, **antes de cada run** el test ejecuta una limpieza automática (globalSetup):

1. **Truncar** órdenes, transacciones, instrumentación, movimientos de CC y caja, auditoría/contingencia si aplica, y resetear secuencias (mismo criterio que `sql/truncar_ordenes_transacciones.sql`).
2. **Borrar** clientes e intermediarios creados por los tests **después** (`clientes.nombre LIKE 'E2E %'`; intermediarios `LIKE 'E2E Int %'` o nombre fijo `E2E CC TiposActivos Int` del spec 02), igual que el bloque opcional al final de `truncar_ordenes_transacciones.sql`.

**Para que la limpieza automática funcione:** en el **proyecto Supabase de desarrollo** (el de Pandy-Dev, no producción), ejecutá **una vez** en SQL Editor **`sql/rpc_limpiar_base_e2e.sql`** (re-ejecutá si cambió). En `.env.test`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` deben ser **de ese mismo proyecto** (si apuntan a producción, la RPC limpiaría la base equivocada). **Sin ellas** `scripts/limpiar-base-e2e.js` termina con **código 1** y el **globalSetup** falla. Para omitir a propio riesgo: `E2E_SKIP_LIMPIAR_BASE=1`. La RPC replica **`sql/truncar_ordenes_transacciones.sql`** + `DELETE` E2E (no trunca `auditoria_app`).

**Semilla de caja tras limpiar:** la misma RPC inserta ingresos manuales (`movimientos_caja`) usando un tipo de **`tipos_movimiento_caja`** con dirección **ingreso** y nombre que coincide en forma case-insensitive con **«Ajuste ingreso»** (p. ej. en dev puede figurar como «Ajuste Ingreso»). Cubre efectivo, banco y cheque (ARS) para que los egresos en instrumentación no fallen por validación de saldo con caja en cero. Los montos deben coincidir con **`tests/e2e/e2e-caja-seed-saldos.js`** y con las expectativas de los fixtures (`cc-*-esperado.js`, `91-orden-cc.spec.js`). Si cambiás los `INSERT` en `sql/rpc_limpiar_base_e2e.sql`, volvé a ejecutar la función en Supabase dev y actualizá ese módulo y los tests si hace falta.

**Entre archivos de test (transaccionalidad):** los specs **01 / 02 / 03** llaman a `node scripts/limpiar-base-e2e.js` al **inicio de cada combinación** (o paso), **no** al final del paso: así cada combinación arranca con base vacía. El **`globalSetup`** corre **una vez** al arrancar el suite (también limpia). El **`globalTeardown`** por defecto **no** limpia, para que puedas abrir la app o Supabase y verificar órdenes/CC/caja tras los tests; si querés truncar al terminar todo el suite (p. ej. CI), usá `E2E_LIMPIAR_AL_FINAL=1`. El **`91`** ejecuta limpieza **al inicio de cada** test del archivo (cliente **`Cliente Playwright 91`** no matchea `E2E %`). Sin `SUPABASE_*` en `.env.test`, **91** puede fallar por datos heredados.

**Nota:** `sql/truncar_ordenes_transacciones.sql` **solo** vacía lo transaccional; **no** borra clientes ni intermediarios. Para el mismo efecto que el globalSetup, usá la RPC o el bloque opcional comentado al final de ese archivo. Tras cambiar `rpc_limpiar_base_e2e.sql`, volvé a ejecutarlo en Supabase para reemplazar la función.

### 1.5 Prerrequisitos para test CC combinaciones (saldo par cerrado)

El test **`tests/e2e/01-cc-combinaciones.spec.js`** valida todas las combinaciones de estados Tx1..Tx4 para **CHEQUE-ARS** con intermediario (tipo de operación con `data-codigo="CHEQUE-ARS"`). Comando dedicado: **`npm run test:e2e-cc-cheque-ars`**. Modelo y regla de oro (tabla vs código): **`docs/CHEQUE_ARS_INTERMEDIARIO.md`**.

**Antes de correrlo**, ejecutá en Supabase **`sql/migracion_cc_modelo_reglas_canonico_cheque_ars.sql` y luego `sql/seed_tipo_operacion_cheque_ars.sql`** para crear/actualizar ese catálogo (el test **`91-orden-cc.spec.js`** también lo usa). **La fuente de verdad está en las tablas:**

- **`movimientos_cuenta_corriente`** y **`movimientos_cuenta_corriente_intermediario`** deben tener **`incluir_en_detalle`** (metadata del sync; qué filas muestra el detalle). El **saldo** en resumen CC es la **suma** por moneda de movimientos no anulados (coherente con la lista Movimientos). Si falta `incluir_en_detalle`, la RPC de sync puede fallar según versión.
- **`cc_modelo_reglas`** debe estar cargada con las reglas que definen **par cerrado** (cliente e intermediario). Para que en combinaciones como **E,E,P,P** el saldo cliente sea 0 (par cerrado: -200k + 195k + 5k), el sync tiene que escribir los movimientos que la tabla define para ese estado; eso sale del lookup por `(estado_transaccion, contrapartida_ejecutada)` en la tabla de reglas.

**Qué ejecutar en Supabase (una vez) antes de correr el test de combinaciones:**

1. **`sql/migracion_cc_sumar_saldo_incluir_detalle.sql`** — histórico: agregaba `incluir_en_detalle` (y antes `sumar_al_saldo`). Si tu base aún tiene `sumar_al_saldo`, ejecutá **`sql/migracion_cc_drop_sumar_al_saldo.sql`** y **`sql/rpc_sync_cc_caja_orden.sql`** actualizado (RPC sin esa columna).
2. **`sql/cc_modelo_reglas_todas_combinaciones.sql`** — script único recomendado: incluye **§0** (`linea_motor` + `UNIQUE`), par cerrado cliente/intermediario y **§6 ARS-USD con intermediario** (flujo inverso, dos líneas `linea_motor` para P,E). Sin esa carga, el test **03** puede fallar y el **01** puede desviarse (p. ej. E,E,P,P con saldo cliente distinto de 0 si faltan reglas CHEQUE-ARS). Si en tu entorno aplicás migraciones por archivo, hacelo **en secuencia** (p. ej. primero **`sql/migracion_cc_modelo_reglas_linea_motor.sql`**, después **`sql/migracion_cc_modelo_reglas_ars_usd_intermediario_flujo_inverso_operativo.sql`**); para dejar **toda** la matriz igual al repo, al final ejecutá de nuevo el script completo de este ítem.
   - **Ajuste P,E** (ARS-USD + intermediario: detalle cliente **sí** lista **+me** USD del egreso ejecutado junto al **−me** del ingreso pendiente — neteo en USD; saldo ARS **−mr** hasta ejecutar el ingreso; sin espejo **+mr** ARS en `main.js`): **`sql/migracion_cc_modelo_reglas_ars_usd_pe_egreso_inter_detalle_intermediario.sql`** o **`sql/migracion_cc_modelo_reglas_ars_usd_pe_egreso_incluir_cliente_usd_detalle.sql`** (o reaplicar **`sql/cc_modelo_reglas_todas_combinaciones.sql`** con §6).
   - **Síntoma:** en **03**, **ARS-USD P,E**, saldo cliente **USD ≈ +5000** (solo cuenta el egreso ejecutado, no el compromiso −me del ingreso pendiente). Suele ser **reglas no cargadas** en el sync: las filas §6 están con **`usa_intermediario = true`**; si el catálogo `tipos_operacion.usa_intermediario` viniera en **false** para ese código, antes el front pedía reglas con `false` y obtenía **cero filas** → solo impactaba la transacción ejecutada. **Comportamiento actual:** al sincronizar CC, si la orden tiene **`intermediario_id`**, se cargan reglas con intermediario (OR con el flag del catálogo).
   - **Síntoma:** en **03** / app, **USD-ARS E,P**, el cliente **debe figurar en ARS** (pago en USD, deuda operativa en ARS), no “debe USD”. Si **`cc_cliente_suma_saldo = true`** en la fila egreso pendiente **`linea_motor = 1`** (−mr USD) sin **+mr USD** en saldo del ingreso, queda saldo **USD −5000** mal. Debe ser **`cc_cliente_suma_saldo = false`** en esa fila; el par USD en **detalle** lo arma **main.js** (espejos del ingreso). **`sql/migracion_cc_modelo_reglas_usd_ars_ep_egreso_pendiente_linea1_mr_usd.sql`** o **`sql/cc_modelo_reglas_todas_combinaciones.sql`** §5.
   - **Síntoma:** en **03**, **USD-ARS E,P**, saldo cliente **ARS ≈ −10.000.000** (debería **−5.000.000**): la fila egreso pendiente **`linea_motor = 0`** no debe **volver a sumar −me** en CC cliente si el ingreso ejecutado Cliente→Intermediario ya registró **−me**; **`cc_cliente_suma_saldo = false`** e **`incluir_en_mov_cc_cliente = false`** en esa fila. Incluido en el mismo **`sql/migracion_cc_modelo_reglas_usd_ars_ep_egreso_pendiente_linea1_mr_usd.sql`** (UPDATE inicial) y en **`sql/migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql`** (bloque D).
   - **Síntoma (histórico):** en **02**, **USD-ARS** sin int **E,E**, saldo USD mal o detalle incompleto. **Actual:** **`sql/reglas_de_negocio_tabla.sql`**: cuatro movimientos (dos por transacción, dos monedas) que netean; ver **`docs/MODELO_CC_USD_ARS_TEORICO.md`**. No usar parches viejos de `linea_motor` en `cc_modelo_reglas` para este caso.
   - **Síntoma:** en **02**, **USD-ARS** sin int **P,E**, saldo cliente **ARS ≠ 0** (p. ej. **+5.000.000** cuando debería **0**) o detalle sin el par ± en ARS: el egreso ejecutado con contrapartida false debe tener **dos líneas ARS** (`monto_transaccion`, signos −1 / +1). **Recomendado (todo sin int junto):** **`sql/migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql`** (12 filas × 6 tipos USD/ARS/EUR). Alternativas puntuales: **`sql/migracion_reglas_usd_ars_sin_int_pe_egreso_dos_lineas_ars.sql`** o **`sql/reglas_de_negocio_tabla.sql`** + **`sql/migracion_reglas_eur_cruces_desde_usd_ars_ars_usd_sin_int_y_eur_ars_int.sql`** solo bloques A/B.
   - **Síntoma:** toast «no coinciden con ninguna regla» con **USD-ARS** / **ARS-USD** sin int. y **ambas** transacciones **pendientes** (P,P): faltan filas `pendiente` + `contrapartida_ejecutada = false`. **`sql/migracion_reglas_usd_ars_ar_usd_pp_contrapartida_false.sql`** o reaplicar el script canónico de cruces sin int. arriba.
   - **Síntoma:** en **03**, **ARS-USD P,E**, saldo cliente **ARS = 0** cuando el ingreso sigue **pendiente** (debería **−5.000.000 ARS**): falta la fila **ingreso** Cliente→Intermediario **pendiente** con **contrapartida ejecutada**, **`linea_motor = 1`**, **−mr** en moneda recibida (ARS), o un espejo **+mr** ARS viejo lo compensa indebidamente. **`sql/migracion_cc_modelo_reglas_ars_usd_pe_ingreso_pendiente_linea1_mr_ars.sql`** (mismo contenido que el bloque **F)** de **`sql/migracion_cc_modelo_reglas_ars_usd_intermediario_flujo_inverso_operativo.sql`**).
   - **Síntoma:** en **03** / app, **USD-ARS P,E** (ingreso Cliente→Intermediario **pendiente** + egreso Pandy→Cliente **ejecutado** en ARS): el cliente **debe USD** (**saldo USD −mr**), **saldo ARS 0** (compromiso **−me** + pago **+me**). Si ves **dos +5M ARS** o **+5000 USD**, faltan reglas o el espejo USD del egreso duplica: **`sql/migracion_cc_modelo_reglas_usd_ars_pe_ingreso_pendiente_linea1_mr_usd.sql`** + **`sql/migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql`** (UPDATE ingreso pendiente **`cc_cliente_signo = −1`** en **me**, línea 0) o **`sql/cc_modelo_reglas_todas_combinaciones.sql`** §5.
   - **02** **E,E** (saldo CC cliente 0): si el resumen oculta la fila o el selector global `data-nombre` no encuentra el botón, el spec hace clic en **`.btn-ver-detalle` dentro de la fila** y si falla usa la vista **Detalle** de movimientos.

**Si solo falla CHEQUE-ARS** (p. ej. combinación **P,P,P,E** con saldo intermediario **-3000** en lugar de **-197000**), podés reaplicar solo la matriz de ese tipo: **`sql/migracion_cc_modelo_reglas_cheque_ars_reaply_matriz.sql`** en el SQL Editor (mismo proyecto que la app).

Si en la app ves **saldo 0 y ningún movimiento** para cliente o intermediario cuando corresponde (p. ej. E,E,P,P), la base está bien y el test debería pasar. Si el test falla con “saldo CC cliente esperado 0, app -200000”, revisá que el proyecto de Supabase que usa el test tenga ejecutados los dos scripts anteriores.

**Tipo de operación en el modal de orden:** la UI muestra un desplegable con **iconos**, pero el **`#orden-tipo-operacion`** sigue siendo un `<select>` real (visualmente oculto) con las mismas `<option value="…" data-codigo="…">`. Los tests deben seguir usando **`page.locator('#orden-tipo-operacion').selectOption(value)`** y **`option[data-codigo="CHEQUE-ARS"]`** (u otros códigos); no hace falta hacer clic en el botón del combobox.

### 1.6 RPC `sync_cc_caja_orden` y filas con `transaccion_numero` null

El front envía filas de CC (p. ej. comisión Pandy) con `transaccion_id` / `transaccion_numero` en **null**. La RPC debe usar en los `INSERT` casts del estilo `(r->>'transaccion_numero')::integer` (operador `->>`, no `->`) para que un `null` en JSON no dispare **cannot cast jsonb null to type integer**. La versión correcta está en **`sql/rpc_sync_cc_caja_orden.sql`**; si en Supabase tenés una versión vieja, volvé a ejecutar ese script en el SQL Editor.

### 1.7 Test `01-cc-combinaciones.spec.js`: tiempos de espera

Las 12 combinaciones hacen varios cambios a **Ejecutada** seguidos y cada uno dispara sync CC/caja. El test usa:

- **`test.setTimeout(900000)`** (15 minutos) para la mayoría de specs CC; **02-cc-tipos-activos** usa **20 min** (`1200000`) por corridas largas.
- **`esperarActualizacionEstadoOrden`**: hasta **90 s** por cada cambio de combo a ejecutada (espera a que desaparezca `#orden-inst-actualizando-msg`).

Si el test corta por timeout global o se queda en “Actualizando estado…”, revisá red/Supabase y que la RPC del punto 1.6 esté desplegada.

### 1.8 Test `02-cc-tipos-activos-combinaciones.spec.js` (2 transacciones; USD-USD también con intermediario)

Cubre las **4 combinaciones** de estados **Tx1/Tx2** (`P,P`, `E,P`, `P,E`, `E,E`) para **ARS-USD**, **USD-ARS**, **USD-USD** (sin intermediario) y **USD-USD con intermediario** (mismas 4 combinaciones; expectativas cliente/caja como sin int; CC intermediario USD solo en **E,E**, mitad de la comisión con split 50/50), con **montos enteros fijos** en `tests/e2e/cc-tipos-activos-esperado.js` (`COMBINACIONES_USD_USD_INT`). Misma dinámica: limpieza E2E al inicio de cada caso, cliente `E2E CC TiposActivos`, intermediario `E2E CC TiposActivos Int` solo en el bloque USD-USD+int, validación de saldos USD/ARS en resumen CC, detalle (modal **Ver detalle**), caja **efectivo USD + ARS**, y columnas **Exp/Real/Rdo Int USD** en el log Excel cuando aplica.

- **CHEQUE-ARS** (4 transacciones + intermediario) **no** está en este archivo: seguir usando **`tests/e2e/01-cc-combinaciones.spec.js`** (§1.5–1.7).
- **Todos los tipos activos, sin duplicar** (01 + 02 + 03): `npm run test:e2e-cc-activos-completo` (CHEQUE-ARS + tipos 2 tx incl. USD-USD+int + USD-ARS/ARS-USD inversa con int.).
- **Solo tipos 2 tx:** `npm run test:e2e-cc-tipos-2tx` (añadí `--headed` si querés ver el navegador).
- **02 + 03 (sin CHEQUE-ARS / 01):** `npm run test:e2e-cc-02-03` — tipos 2 tx (incl. USD-USD+int) + intermediario inversa USD-ARS / ARS-USD.
- **Log Excel** (importes como número): misma workbook **`test-results/cc-combinaciones-log.xlsx`**, hoja **CC Tipos 2tx** (junto con 01/03/91; ver §2.2).
- **Filtros opcionales:** `TIPO_CODIGO` (`ARS-USD` | `USD-ARS` | `USD-USD`), `COMBINACION_ID` (`P,P` | `E,P` | `P,E` | `E,E`) y, **solo si `TIPO_CODIGO=USD-USD`**, `TIPO_USA_INTERMEDIARIO=true` para correr **solo** el tipo USD-USD **con** intermediario (sin esa variable, `TIPO_CODIGO=USD-USD` sigue siendo solo **sin** intermediario). Ejemplo:
  `TIPO_CODIGO=USD-ARS COMBINACION_ID="E,P" npx playwright test tests/e2e/02-cc-tipos-activos-combinaciones.spec.js --headed`
- **Solo USD-ARS sin intermediario (4 combinaciones):** `npm run test:e2e-cc-usd-ars-sin-int`. En Supabase: **`sql/reglas_de_negocio_tabla.sql`** o migraciones puntuales; elimina USD-ARS `usa_intermediario = false` de `cc_modelo_reglas`. Ver `docs/REGLAS_DE_NEGOCIO.md`.
- **Solo ARS-USD sin intermediario (4 combinaciones):** `npm run test:e2e-cc-ars-usd-sin-int`. En Supabase: mismas filas en **`reglas_de_negocio`** (incluidas en `reglas_de_negocio_tabla.sql`) y **`sql/migracion_reglas_ars_usd_sin_int.sql`** si ya tenías la tabla; elimina ARS-USD sin int de `cc_modelo_reglas`. Sin eso, el test puede desviarse o quedar en fallback.
- **Solo USD-USD sin intermediario (4 combinaciones):** `npm run test:e2e-cc-usd-usd-sin-int`. Comisión implícita **mr − me**; reglas en **`reglas_de_negocio`** (UPSERT **`sql/migracion_reglas_usd_usd_sin_int.sql`**). Ver **`docs/USD_USD_SIN_INTERMEDIARIO.md`**.
- **Solo USD-USD con intermediario (4 combinaciones, mismo spec 02):** `npm run test:e2e-cc-usd-usd-int-combos` (`TIPO_CODIGO=USD-USD` + `TIPO_USA_INTERMEDIARIO=true`). Requiere reglas al día (**`sql/reglas_de_negocio_tabla.sql`** o **`sql/migracion_usd_usd_int_cp_ic_intermediario_pe_deuda.sql`** para el saldo intermediario en **P,E** cp_ic). Ver **`docs/USD_USD_CON_INTERMEDIARIO.md`**.
- **USD-USD con intermediario (91, smoke rápido):** `npm run test:e2e-cc-usd-usd-int` — un solo flujo E,E con montos fijos en **91-orden-cc** (complementa la matriz 02).

Requisitos en Supabase: **`reglas_de_negocio`** para los tipos que cubre el spec (USD-ARS, ARS-USD, USD-USD sin/con intermediario, CHEQUE-ARS en otros specs); la app ya **no** usa **`cc_modelo_reglas`** (tabla legacy opcional/eliminable). RPC `sync_cc_caja_orden` actualizada. Si alguna combinación **P,E** o **E,P** falla tras un cambio de reglas, calibrar expectativas en `cc-tipos-activos-esperado.js` (no aflojar asserts sin revisar negocio). Si el resumen CC en pantalla es correcto pero el test lee otro saldo, suele ser **sync intermedio** tras **Refrescar**: el spec reintenta lectura hasta coincidir (`esperarSaldosResumenCliente`).

- **Resumen CC en pantalla vs esperado algebraico:** los fixtures guardan la **suma algebraica** de movimientos en base; la app puede mostrar **−E** (cobro a Pandy) o **+E** (cuando lo pendiente es pago desde Pandy) según la clasificación por transacción. Los specs **01**, **02** y **03** usan **`tests/e2e/cc-resumen-optica-match.js`**: aceptan si `min(|leído + E|, |leído − E|) ≤ 1` (más tolerancia cuando ambos son ~0). Ver **`docs/CC_NETEO_USD_ARS_VS_ARS_USD.md`** (párrafo UI).

- **Reload tras limpiar base:** `tests/e2e/e2e-reload-app.js` (`reloadYEsperarAppLista`) — espera hasta ~75 s a que el sidebar pase a visible tras `getSession`/permisos; si aparece login (sesión expirada), vuelve a autenticar. Lo usan **01**, **02** y **03** (antes **01** solo hacía `reload` + 15 s y podía dejar la app a medio arrancar: `#orden-inst-tbody` sin filas / 0 combos).
- **Timeout por combinación en 02:** no hay tope por paso; la combinación **E,E** puede tardar varios minutos (2× espera de orden + CC + sync). El test completo usa **`test.setTimeout(1200000)`** (20 min). Tras **Refrescar** en CC, se espera a que **`#cc-loading`** desaparezca y luego se **poll** del saldo USD/ARS del cliente hasta igualar lo esperado (evita leer un valor intermedio). Tras cargar CC, **Ver detalle** usa `data-nombre`, **reintentos** y `click({ force: true })` (sin depender de `scrollIntoView`, que puede dejar el nodo *detached* si el tbody se regenera).

### 1.9 Tabla Excel / LibreOffice: comando por tipo y por combinación

Archivo **`docs/e2e-comandos-por-tipo-y-combinacion.tsv`** (columnas separadas por tabulador): abrilo en Excel o LibreOffice para tener **tipo de operación → spec → combinación → comando** (`npm run …` o `TIPO_CODIGO=… COMBINACION_ID="…" npx playwright test …`). Incluye CHEQUE-ARS (12), tipos 2 tx del **02** (ARS/USD y **EUR-USD, USD-EUR, EUR-ARS, ARS-EUR** sin int.), inversa **03** (USD-ARS/ARS-USD y los cuatro cruces análogos con EUR+int) y paquetes **npm run test:e2e-cc-***.

---

## 2. Cómo correr los tests

### 2.0 Orden al correr toda la carpeta `tests/e2e`

Con **`workers: 1`** y **`fullyParallel: false`** (en `playwright.config.js`), los archivos se ejecutan en **orden lexicográfico** del nombre. Los prefijos numéricos fijan este orden:

1. **`01-cc-combinaciones.spec.js`** — **CHEQUE-ARS**: las **12** combinaciones Tx1..Tx4 (terminan todas antes de seguir).
2. **`02-cc-tipos-activos-combinaciones.spec.js`** — tipos **2 tx**: **ARS-USD** (4), **USD-ARS** (4), **USD-USD** sin int. (4), **USD-USD** con intermediario (4).
3. **`03-cc-intermediario-inversa-combinaciones.spec.js`** — **USD-ARS** y **ARS-USD** con intermediario (flujo inverso), todas las combinaciones de cada tipo antes del siguiente. **Por tipo (`reglas_de_negocio`):** `npm run test:e2e-cc-usd-ars-int-inversa` (`TIPO_CODIGO=USD-ARS`) y `npm run test:e2e-cc-ars-usd-int-inversa` (`TIPO_CODIGO=ARS-USD`). Filtros opcionales: `TIPO_CODIGO`, `COMBINACION_ID`. Expectativas: `tests/e2e/cc-intermediario-inversa-esperado.js` (montos fijos **5k USD / 5M ARS**, TC **1000**). SQL: **`sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql`** y **`sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`** (más migraciones puntuales E,P/E,E si la base ya tenía reglas viejas). Comentarios en el esperado por combinación.
4. **`90-login.spec.js`** — login y smoke.
5. **`91-orden-cc.spec.js`** — flujos por tipo (CHEQUE-ARS, ARS-USD, etc.) y reversa.

En terminal verás líneas `[E2E 1/5]` … `[E2E 5/5]` y subpasos por combinación. **Solo matriz de activos (sin 91 / sin repetir tipos):** `npm run test:e2e-cc-activos-completo` (01+02+03). La suite completa `npm run test:e2e` incluye además 90-login y 91 (smoke + reversa).

En la raíz del proyecto:

```bash
npm run test:e2e
```

- Si todo pasa, verás algo como “X passed”.
- Si algo falla, Playwright genera un reporte (en terminal y, si está habilitado, en `playwright-report/` o `test-results/`). **Copiá el error o el fragmento del reporte y pasámelo** para que pueda corregir el código o el test.

Para ver el navegador mientras se ejecutan los tests (útil para depurar):

```bash
npm run test:e2e -- --headed
```

### 2.1 Correr pruebas de a una (no todas juntas)

Podés ejecutar **solo un grupo de tests** o **un solo test** con el filtro `--grep` (o `-g`):

**Por nombre del describe (bloque):**
```bash
npx playwright test --grep "Orden ARS-ARS"
npx playwright test --grep "Orden USD-USD"
npx playwright test --grep "Orden ARS-USD"
npx playwright test --grep "Orden USD-ARS"
```

**Por parte del título del test:**
```bash
npx playwright test -g "crear orden ARS-ARS"
npx playwright test -g "crear orden USD-USD"
```

**Solo un archivo de tests (todos los describe de ese archivo):**
```bash
npx playwright test tests/e2e/91-orden-cc.spec.js
```

**Solo login (sin órdenes/CC):**
```bash
npx playwright test tests/e2e/90-login.spec.js
```

El patrón de `--grep` es una expresión regular. Si querés combinar con `--headed` para ver el navegador: `npx playwright test --grep "USD-USD" --headed`.

### 2.2 Log de prueba en Excel

**Workbook única:** **`test-results/cc-combinaciones-log.xlsx`**. Conviven varias hojas según qué specs corrieron:

| Hoja | Origen |
|------|--------|
| **CC Combinaciones** | `01-cc-combinaciones.spec.js` (CHEQUE-ARS, 12 combinaciones) |
| **CC Tipos 2tx** | `02-cc-tipos-activos-combinaciones.spec.js` (ARS-USD, USD-ARS, USD-USD, USD-USD+int) |
| **CC Inversa** | `03-cc-intermediario-inversa-combinaciones.spec.js` (USD-ARS / ARS-USD con intermediario) |
| **Pasos**, **Transacciones**, **Caja** | `91-orden-cc.spec.js` (`e2e-log-excel.js`): se **agregan filas** en cada corrida (no se borran las hojas anteriores del mismo archivo) |

En **Pasos** verás, por cada paso: **Tipo operación**, **Paso**, **Acción**, **Resultado esperado**, **Comprobación**, **Estado** (OK/Fallo), **Observaciones** y **Fecha/Hora**. En **Transacciones**, cada transacción con **Saldo CC capturado (ARS)** y el resto de columnas. Las hojas de combinaciones usan **números** en columnas de importes/saldos (regla LyP Excel).

*(Antes se generaban `e2e-log-{tipo}.xlsx` por tipo; el default de `writeLogToExcel()` ahora es este mismo archivo; otra ruta solo si pasás `filePath` explícito.)*

### 2.3 Test “colgado” después de `Base limpiada`

Tras cada limpieza, los specs **01**, **02** y **03** hacen `page.reload(...)`. **No uses `waitUntil: 'networkidle'`** con esta app: Supabase (Realtime, websockets, reconexiones) suele mantener la red activa y la condición **nunca se cumple**, dejando el reload esperando sin imprimir más líneas. Los tests usan **`domcontentloaded`** y **timeout explícito** (30 s). Si agregás pasos nuevos con `reload` o `goto`, seguí el mismo criterio que el login (`domcontentloaded` / `load`), no `networkidle`.

---

## 3. Qué hace el asistente con los resultados

- Vos corrés `npm run test:e2e` y, si hay fallos, me pasás el mensaje de error o un resumen del reporte.
- Yo analizo el fallo, propongo cambios en la app o en los tests y te indico qué archivos toqué.
- Vos volvés a correr los tests para confirmar que pasan.
- Podemos ir sumando más casos al Excel/plan de pruebas y nuevos tests que los cubran.

---

## 4. Resumen de lo que necesitamos de tu parte

| Qué | Acción tuya |
|-----|-------------|
| Instalar Playwright | `npm install` y `npx playwright install` |
| Credenciales de prueba | Crear `.env.test` desde `.env.test.example` y completar email y contraseña (y opcionalmente `TEST_BASE_URL`) |
| App levantada | Al probar en local: `npm run dev` en una terminal |
| Mismo Supabase | Que `config.js` apunte al proyecto donde existe el usuario de prueba |
| Resultados de fallos | Cuando un test falle, pasarme el error o el reporte para que yo corrija |

No hace falta que me pases la contraseña por chat; solo que la pongas en tu `.env.test` local.

---

## 5. Tests incluidos y requisitos de datos

**Cobertura por tipo de operación activo** (`codigo` + `usa_intermediario`): ver **`docs/E2E_COBERTURA_TIPOS_OPERACION.md`** (matriz 6 filas activas típicas → specs 01 / 02 / 03 sin duplicar; `91` como smoke opcional).

| Archivo | Qué prueba |
|--------|------------|
| `tests/e2e/90-login.spec.js` | Login y navegación básica (Panel de Control). |
| `tests/e2e/91-orden-cc.spec.js` | **CHEQUE-ARS** y flujos por tipo: orden con/sin intermediario, CC, caja y log Excel. Incluye bloque **Reversa**. |
| `tests/e2e/01-cc-combinaciones.spec.js` | Todas las combinaciones E/P de Tx1..Tx4 para **CHEQUE-ARS** con intermediario; valida saldo y detalle CC cliente e intermediario y caja. Requiere en Supabase: `migracion_cc_sumar_saldo_incluir_detalle.sql`, `cc_modelo_reglas_todas_combinaciones.sql` y RPC `sync_cc_caja_orden` actualizada (ver §1.5–1.7). Log: hoja **CC Combinaciones** en `test-results/cc-combinaciones-log.xlsx`. |
| `tests/e2e/02-cc-tipos-activos-combinaciones.spec.js` | Combinaciones Tx1/Tx2 para **ARS-USD**, **USD-ARS**, **USD-USD** (sin int.), **USD-USD** con intermediario (`TIPO_USA_INTERMEDIARIO` si filtrás solo ese bloque); montos fijos enteros; CC cliente + caja; CC intermediario USD en USD-USD+int. Log: hoja **CC Tipos 2tx** en `cc-combinaciones-log.xlsx`. Ver §1.8. |
| `tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js` | **USD-ARS** y **ARS-USD** con intermediario (flujo inverso); en Detalles elige radio **ci_pc** y la app autocompleta 2 transacciones; luego solo se marcan estados P/E. Validación CC/caja. Log: hoja **CC Inversa** en `cc-combinaciones-log.xlsx`. Corre después de 01 y 02 en la suite completa (ver §2.0). |

Para que los tests de orden/CC pasen, en tu proyecto de Supabase necesitás:

- **Tipos de operación** activos: **ARS-ARS**, **ARS-USD**, **USD-ARS** y **USD-USD** (tabla `tipos_operacion`). Si corrés `sql/migracion_tipos_operacion_unique_codigo_usa_intermediario.sql`, puede haber **dos filas** con `codigo = USD-ARS` (`usa_intermediario` false y true); los E2E de **sin intermediario** eligen `option[data-usa-intermediario="false"]`.
- **Al menos un cliente** y **al menos un intermediario** activos (además de la opción “Sin asignar”).
- Usuario de prueba con permisos para: crear órdenes, editar órdenes y editar transacciones (para poder pasar transacciones a “Ejecutada”).
