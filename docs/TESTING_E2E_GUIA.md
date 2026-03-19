# Guía: tests E2E con Playwright (opción B)

Esta guía indica **qué tenés que hacer vos** para que los tests automatizados funcionen y cómo usarlos.

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
   - `TEST_USER_EMAIL`: email del usuario con el que querés que los tests hagan login (puede ser tu usuario o uno solo para pruebas).
   - `TEST_USER_PASSWORD`: contraseña de ese usuario.

Ejemplo de `.env.test` (los valores son de ejemplo):

```
TEST_BASE_URL=http://localhost:5173
TEST_USER_EMAIL=tu-usuario-de-prueba@ejemplo.com
TEST_USER_PASSWORD=tu_contraseña_secreta
```

El archivo `.env.test` ya está en `.gitignore`; no se sube al repositorio.

### 1.3 Tener la app levantada cuando corras los tests

Los tests abren la URL que configuraste (por ejemplo `http://localhost:5173`). Esa app debe estar corriendo y usando **el mismo proyecto de Supabase** que tu `config.js` (misma URL y anon key).

- Para probar en local: en una terminal dejá corriendo `npm run dev` y en otra ejecutá los tests.
- Si Vite dice "Port 5173 is in use, trying another one..." y arranca en otro puerto (ej. 5174), poné en `.env.test`: `TEST_BASE_URL=http://localhost:5174` (o el puerto que muestre Vite). Si no, los tests intentan abrir 5173 y fallan con `net::ERR_CONNECTION_REFUSED`.
- Si más adelante tenés una URL de staging, podés poner esa en `TEST_BASE_URL` y no hace falta levantar nada en tu máquina.

### 1.4 Base limpia para tests de Órdenes y CC (ambiente de desarrollo)

Los tests de **Órdenes y Cuenta corriente** crean órdenes y comprueban saldos. Para no acumular suciedad en la base, **antes de cada run** el test ejecuta una limpieza automática (globalSetup):

1. **Borrar** clientes e intermediarios creados por los tests (nombre `E2E %` / `E2E Int %`).
2. **Truncar** órdenes, transacciones, instrumentación, movimientos de CC y caja, y resetear secuencias (igual que `sql/truncar_ordenes_transacciones.sql`).

**Para que la limpieza automática funcione:** ejecutá **una vez** en Supabase (SQL Editor) **`sql/rpc_limpiar_base_e2e.sql`** y en `.env.test` agregá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Si no están, el globalSetup no hace nada y los tests corren igual; podés truncar a mano con **`sql/truncar_ordenes_transacciones.sql`** cuando quieras arranque limpio.

### 1.5 Prerrequisitos para test CC combinaciones (saldo par cerrado)

El test **`tests/e2e/cc-combinaciones.spec.js`** valida todas las combinaciones de estados Tx1..Tx4 para **CHEQUE-ARS** con intermediario (tipo de operación con `data-codigo="CHEQUE-ARS"`). **Antes de correrlo**, ejecutá en Supabase **`sql/migracion_cc_modelo_reglas_canonico_cheque_ars.sql` y luego `sql/seed_tipo_operacion_cheque_ars.sql`** para crear/actualizar ese catálogo (el test **`orden-cc.spec.js`** también lo usa). **La fuente de verdad está en las tablas:**

- **`movimientos_cuenta_corriente`** y **`movimientos_cuenta_corriente_intermediario`** deben tener las columnas **`sumar_al_saldo`** e **`incluir_en_detalle`**. El saldo que muestra la app es la suma solo de los movimientos con `sumar_al_saldo = true`. Si faltan esas columnas, la RPC de sync puede fallar o el saldo no cerrará bien.
- **`cc_modelo_reglas`** debe estar cargada con las reglas que definen **par cerrado** (cliente e intermediario). Para que en combinaciones como **E,E,P,P** el saldo cliente sea 0 (par cerrado: -200k + 195k + 5k), el sync tiene que escribir tres movimientos con `sumar_al_saldo = true`; eso sale del lookup por `(estado_transaccion, contrapartida_ejecutada)` en la tabla de reglas.

**Qué ejecutar en Supabase (una vez) antes de correr el test de combinaciones:**

1. **`sql/migracion_cc_sumar_saldo_incluir_detalle.sql`** — agrega `sumar_al_saldo` e `incluir_en_detalle` a ambas tablas de movimientos de CC.
2. **`sql/cc_modelo_reglas_todas_combinaciones.sql`** — inserta/actualiza todas las filas de reglas (incl. par cerrado cliente y par cerrado intermediario). Sin esto, el sync puede escribir solo el -200k para cliente en E,E,P,P y el test verá saldo -200.000 en lugar de 0.

Si en la app ves **saldo 0 y ningún movimiento** para cliente o intermediario cuando corresponde (p. ej. E,E,P,P), la base está bien y el test debería pasar. Si el test falla con “saldo CC cliente esperado 0, app -200000”, revisá que el proyecto de Supabase que usa el test tenga ejecutados los dos scripts anteriores.

**Tipo de operación en el modal de orden:** la UI muestra un desplegable con **iconos**, pero el **`#orden-tipo-operacion`** sigue siendo un `<select>` real (visualmente oculto) con las mismas `<option value="…" data-codigo="…">`. Los tests deben seguir usando **`page.locator('#orden-tipo-operacion').selectOption(value)`** y **`option[data-codigo="CHEQUE-ARS"]`** (u otros códigos); no hace falta hacer clic en el botón del combobox.

### 1.6 RPC `sync_cc_caja_orden` y filas con `transaccion_numero` null

El front envía filas de CC (p. ej. comisión Pandy) con `transaccion_id` / `transaccion_numero` en **null**. La RPC debe usar en los `INSERT` casts del estilo `(r->>'transaccion_numero')::integer` (operador `->>`, no `->`) para que un `null` en JSON no dispare **cannot cast jsonb null to type integer**. La versión correcta está en **`sql/rpc_sync_cc_caja_orden.sql`**; si en Supabase tenés una versión vieja, volvé a ejecutar ese script en el SQL Editor.

### 1.7 Test `cc-combinaciones.spec.js`: tiempos de espera

Las 12 combinaciones hacen varios cambios a **Ejecutada** seguidos y cada uno dispara sync CC/caja. El test usa:

- **`test.setTimeout(900000)`** (15 minutos) para el test completo.
- **`esperarActualizacionEstadoOrden`**: hasta **90 s** por cada cambio de combo a ejecutada (espera a que desaparezca `#orden-inst-actualizando-msg`).

Si el test corta por timeout global o se queda en “Actualizando estado…”, revisá red/Supabase y que la RPC del punto 1.6 esté desplegada.

---

## 2. Cómo correr los tests

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
npx playwright test tests/e2e/orden-cc.spec.js
```

**Solo login (sin órdenes/CC):**
```bash
npx playwright test tests/e2e/login.spec.js
```

El patrón de `--grep` es una expresión regular. Si querés combinar con `--headed` para ver el navegador: `npx playwright test --grep "USD-USD" --headed`.

### 2.2 Log de prueba en Excel

Los tests de orden y CC escriben un log en Excel por tipo de operación. Tras correr los tests, en **`test-results/`** tendrás:

- **`e2e-log-ARS-ARS.xlsx`** (si corrió el test ARS-ARS)
- **`e2e-log-ARS-USD.xlsx`** (si corrió el test ARS-USD)
- **`e2e-log-USD-ARS.xlsx`** (si corrió el test USD-ARS)
- **`e2e-log-USD-USD.xlsx`** (si corrió el test USD-USD)

En la hoja **Pasos** verás, por cada paso: **Tipo operación** (ej. ARS-ARS, USD-USD), **Paso**, **Acción**, **Resultado esperado**, **Comprobación**, **Estado** (OK/Fallo), **Observaciones** (incluye el saldo capturado con signo cuando aplica) y **Fecha/Hora**. En la hoja **Transacciones** se registra cada transacción con **Tipo operación**, **Saldo CC capturado (ARS)** con signo (+/−) y el resto de columnas. La columna **Tipo operación** sirve para distinguir casos de prueba cuando agregues más tipos (filtrar o ordenar por ella).

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

| Archivo | Qué prueba |
|--------|------------|
| `tests/e2e/login.spec.js` | Login y navegación básica (Panel de Control). |
| `tests/e2e/orden-cc.spec.js` | **ARS-ARS:** Orden con intermediario (4 transacciones), verificar CC cliente e intermediario y caja (saldo esperado ARS, nro transacción). **ARS-USD**, **USD-ARS** y **USD-USD:** Orden sin intermediario (2 transacciones), verificar CC cliente, vista Cajas y log (USD-USD con saldo esperado USD y nro transacción). |
| `tests/e2e/cc-combinaciones.spec.js` | Todas las combinaciones E/P de Tx1..Tx4 para ARS-ARS con intermediario; valida saldo y detalle CC cliente e intermediario y caja. Requiere en Supabase: `migracion_cc_sumar_saldo_incluir_detalle.sql`, `cc_modelo_reglas_todas_combinaciones.sql` y RPC `sync_cc_caja_orden` actualizada (ver §1.5–1.7). Log: `test-results/cc-combinaciones-log.xlsx`. |

Para que los tests de orden/CC pasen, en tu proyecto de Supabase necesitás:

- **Tipos de operación** activos: **ARS-ARS**, **ARS-USD**, **USD-ARS** y **USD-USD** (tabla `tipos_operacion`, `codigo` en `('ARS-ARS','ARS-USD','USD-ARS','USD-USD')`).
- **Al menos un cliente** y **al menos un intermediario** activos (además de la opción “Sin asignar”).
- Usuario de prueba con permisos para: crear órdenes, editar órdenes y editar transacciones (para poder pasar transacciones a “Ejecutada”).
