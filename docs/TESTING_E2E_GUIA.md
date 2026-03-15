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
- Si más adelante tenés una URL de staging, podés poner esa en `TEST_BASE_URL` y no hace falta levantar nada en tu máquina.

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

Para que los tests de orden/CC pasen, en tu proyecto de Supabase necesitás:

- **Tipos de operación** activos: **ARS-ARS**, **ARS-USD**, **USD-ARS** y **USD-USD** (tabla `tipos_operacion`, `codigo` en `('ARS-ARS','ARS-USD','USD-ARS','USD-USD')`).
- **Al menos un cliente** y **al menos un intermediario** activos (además de la opción “Sin asignar”).
- Usuario de prueba con permisos para: crear órdenes, editar órdenes y editar transacciones (para poder pasar transacciones a “Ejecutada”).
