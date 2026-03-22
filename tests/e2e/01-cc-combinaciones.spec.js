// @ts-check
/**
 * Tests E2E: **12 combinaciones** Tx1..Tx4 para CHEQUE-ARS con intermediario.
 * Tx1–Tx2: Cliente↔Pandy; Tx3–Tx4: Pandy↔Intermediario (instrumentación explícita en momento cero).
 * Prerrequisito: tipo `CHEQUE-ARS` en catálogo (sql/seed_tipo_operacion_cheque_ars.sql).
 * Mismos datos fijos (200k, 195k, 197k, 5k, 3k). Valida saldo y detalle CC cliente e intermediario.
 * Escribe un log en Excel (test-results/cc-combinaciones-log.xlsx) con expectativa, real y resultado (PASS/ERR) por combinación.
 *
 * Fuente de verdad: **`reglas_de_negocio`** para CHEQUE-ARS + intermediario (ver `docs/CHEQUE_ARS_INTERMEDIARIO.md`). El saldo CC = suma por moneda de movimientos persistidos (no anulados).
 * Solo si en algún momento ejecutaste `sql/migracion_reglas_cheque_ars_sin_trx_pandy_int.sql`, volvé a correr **`sql/migracion_reglas_de_negocio_cheque_ars.sql`** para recuperar reglas ancladas a Tx3/Tx4. Si **nunca** corriste ese script, no hace falta tocar Supabase por eso.
 * Par cerrado cliente (E,E,*,*) requiere reglas correctas para que el sync cierre CC cliente. Si falla, revisá `sql/migracion_reglas_de_negocio_cheque_ars.sql` y sync (ver docs/TESTING_E2E_GUIA.md §1.5).
 * Si falla sync con "cannot cast jsonb null to type integer", re-ejecutá sql/rpc_sync_cc_caja_orden.sql (§1.6).
 * Timeouts del test: 15 min global y 90 s por paso a ejecutada (§1.7).
 *
 * NPM: `npm run test:e2e-cc-cheque-ars` (equivale a correr este spec).
 * Una sola combinación (para revisar en la app que reglas y caso de prueba cierran):
 *   COMBINACION_ID="E,P,E,P" npx playwright test tests/e2e/01-cc-combinaciones.spec.js --headed
 * (Comillas obligatorias para respetar las comas. Reemplazá por: P,P,P,P | P,P,P,E | P,E,P,P | P,E,P,E | E,P,P,P | E,P,P,E | E,P,E,P | E,P,E,E | E,E,P,P | E,E,P,E | E,E,E,P | E,E,E,E)
 *
 * Convención: al inicio de cada combinación se limpia la base (limpiar-base-e2e) y se crea una orden
 * nueva (cliente E2E CC Combinaciones, intermediario E2E Int + timestamp). Solo se marcan como
 * ejecutada las Tx que indica la combinación (nunca se reversa a pendiente).
 * Expectativas = tabla de reglas (cc-combinaciones-esperado.js); ante fallo: explicar qué falló y calibrar
 * (no cambiar el esperado para "hacer pasar" el test).
 */
const path = require('path');
const { execSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { writeSuiteSheet } = require('./cc-combinaciones-log-workbook');
const { COMBINACIONES_ESPERADO, DATOS_FIJOS } = require('./cc-combinaciones-esperado');

const LOG_HEADERS = [
  'Combinación',
  'Expect Saldo CC Cliente', 'Real Saldo CC Cliente', 'Resultado Saldo Cliente',
  'Expect Saldo CC Int', 'Real Saldo CC Int', 'Resultado Saldo Int',
  'Expect Detalle Cliente', 'Real Detalle Cliente', 'Resultado Detalle Cliente',
  'Expect Detalle Int', 'Real Detalle Int', 'Resultado Detalle Int',
  'Exp_Sdo_CE', 'Real_Sdo_CE', 'Saldo_CE_Rdo',
  'Exp_Sdo_CCh', 'Real_Sdo_CCh', 'Saldo_CCh_Rdo',
];

function escribirLogExcel(logRows) {
  writeSuiteSheet('CC Combinaciones', logRows);
}

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

/** Cliente fijo para este test. Arranque limpio: al inicio se anulan todas sus órdenes. */
const CLIENTE_CC_COMBINACIONES = 'E2E CC Combinaciones';

/** Igual que orden-cc: espera a que el mensaje "Actualizando estado…" desaparezca. Timeout alto (90s) porque el sync CC/caja puede tardar cuando hay varias Tx ejecutadas. */
async function esperarActualizacionEstadoOrden(page, timeoutMs = 90000) {
  const msg = page.locator('#orden-inst-actualizando-msg');
  await msg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await msg.waitFor({ state: 'hidden', timeout: timeoutMs });
}

async function loginAndSeeApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10000 });
  await page.locator('#login-email').fill(TEST_USER_EMAIL);
  await page.locator('#login-password').fill(TEST_USER_PASSWORD);
  await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();
  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 20000 });
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#app-content')).toBeVisible({ timeout: 5000 });
}

async function leerSaldoConSigno(celda) {
  const spanNeg = celda.locator('span.valor-negativo').first();
  const spanPos = celda.locator('span.valor-positivo').first();
  if ((await spanNeg.count()) > 0) {
    const t = (await spanNeg.textContent())?.trim() || '';
    return t ? '-' + t : '–';
  }
  if ((await spanPos.count()) > 0) {
    const t = (await spanPos.textContent())?.trim() || '';
    return t ? '+' + t : '–';
  }
  const t = (await celda.textContent())?.trim() || '';
  return t && /\d/.test(t) ? t : '–';
}

function normalizarMontoSaldo(s) {
  if (s === '–' || s === '' || s == null) return 0;
  // La app usa "−" (U+2212); quitar todos los signos al inicio y normalizar a guión ASCII para Number()
  const t = String(s).replace(/^[\s+\-\u2212]+/, '').replace(/\u2212/g, '-').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}

/** Convierte string de saldo leído (ej. "-200.000", "+3.000") a número con signo. */
function saldoLeidoANumero(saldoStr) {
  if (saldoStr === '–' || saldoStr === '' || saldoStr == null) return 0;
  const neg = /^-|−/.test(String(saldoStr));
  const abs = normalizarMontoSaldo(saldoStr);
  return neg ? -abs : abs;
}

/**
 * En el resumen CC, para intermediario la app invierte el signo para color:
 * DB negativo (int debe) → se muestra en verde (valor-positivo). Al leer debemos invertir.
 */
function saldoResumenANumero(saldoStr, esIntermediario) {
  const n = saldoLeidoANumero(saldoStr);
  if (!esIntermediario) return n;
  const s = String(saldoStr || '').trim();
  // Históricamente, en intermediario algunas vistas mostraban el signo invertido por color:
  // si viene explícitamente "+" interpretamos deuda (negativo real); si viene "-" respetamos tal cual.
  if (/^\+/.test(s)) return -Math.abs(n);
  if (/^[-−]/.test(s)) return n;
  // Fallback legacy cuando no hay signo explícito.
  return -n;
}

/** Va a Cajas, lee saldo efectivo ARS (#cajas-saldo-efectivo-ars). La app muestra valor absoluto; el signo viene de la clase negativo. Si sale "–", espera 2s y relee una vez (sync puede tardar). */
async function leerSaldoCajaEfectivoARS(page) {
  await page.locator('#menu-cajas').click();
  await expect(page.locator('#vista-cajas')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cajas-saldos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cajas-loading')).toBeHidden({ timeout: 20000 });
  const el = page.locator('#cajas-saldo-efectivo-ars');
  let texto = (await el.textContent())?.trim() || '–';
  if (texto === '–' || !/\d/.test(texto)) {
    await page.waitForTimeout(2000);
    texto = (await el.textContent())?.trim() || '–';
  }
  if (texto === '–' || !/\d/.test(texto)) return 0;
  const esNegativo = await el.evaluate((node) => node.classList.contains('negativo'));
  const abs = normalizarMontoSaldo(texto);
  return esNegativo ? -abs : abs;
}

/** Lee saldo caja cheque ARS desde la vista Cajas (asume que ya estamos en #vista-cajas, p. ej. tras leer efectivo). */
async function leerSaldoCajaChequeARS(page) {
  const el = page.locator('#cajas-saldo-cheque-ars');
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return 0;
  const texto = (await el.textContent())?.trim() || '–';
  if (texto === '–' || !/\d/.test(texto)) return 0;
  const esNegativo = await el.evaluate((node) => node.classList.contains('negativo')).catch(() => false);
  const abs = normalizarMontoSaldo(texto);
  return esNegativo ? -abs : abs;
}

async function obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente) {
  const nombre = (nombreCliente || '').trim();
  const rows = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') });
  if (!nombre) return rows;
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cellText = (await rows.nth(i).locator('td').first().textContent())?.trim() || '';
    if (cellText === nombre) return rows.nth(i);
  }
  return tbodyCc.locator('tr').filter({ hasText: 'nunca-coincide-e2e-' + nombre });
}

/**
 * Rellena el Real del log desde la vista "Detalle de movimientos" cuando en Resumen no hay fila (saldo 0).
 * Se queda en la misma pantalla CC: clic en "Detalle de movimientos", Tipo ya está en cliente/intermediario, se lee la tabla.
 * Columna entidad = td:nth-child(10); montos en 6 (USD), 7 (ARS), 8 (EUR). Timeouts cortos y try/catch para no frenar la prueba.
 */
async function leerMontosDesdeVistaDetalle(page, tipo, nombreEntity) {
  const nombre = (nombreEntity || '').trim();
  if (!nombre) return [];
  try {
    await page.locator('#cc-filtro-tipo button[data-tipo="' + tipo + '"]').click();
    await page.locator('#cc-filtro-tipo button[data-tipo="' + tipo + '"].activo').waitFor({ state: 'visible', timeout: 2000 });
    await page.waitForTimeout(400);
    await page.locator('#cc-vista-toggle button[data-vista="detalle"]').click();
    await page.locator('#cc-detalle-wrap').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const tbody = page.locator('#cc-vista-detalle-tbody');
    await tbody.waitFor({ state: 'visible', timeout: 3000 });
    const allRows = tbody.locator('tr');
    const count = await allRows.count();
    const montos = [];
    for (let i = 0; i < count; i++) {
      const row = allRows.nth(i);
      const tdEntity = row.locator('td:nth-child(10)');
      if ((await tdEntity.count()) === 0) continue;
      const entityText = (await tdEntity.textContent())?.trim() || '';
      if (!entityText.includes(nombre)) continue;
      for (const col of [7, 6, 8]) {
        const celda = row.locator('td:nth-child(' + col + ')');
        const texto = await leerSaldoConSigno(celda);
        if (texto !== '–' && /\d/.test(texto)) {
          montos.push(saldoLeidoANumero(texto));
          break;
        }
      }
    }
    await page.locator('#cc-vista-toggle button[data-vista="resumen"]').click();
    await page.locator('#cc-contenido').waitFor({ state: 'visible', timeout: 3000 });
    await page.waitForTimeout(200);
    return [...montos].sort((a, b) => a - b);
  } catch (_) {
    try {
      await page.locator('#cc-vista-toggle button[data-vista="resumen"]').click().catch(() => {});
    } catch (_) {}
    return [];
  }
}

test.describe('CC CHEQUE-ARS: combinaciones de estados Tx1..Tx4', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden con datos fijos y validar saldo/detalle en cada combinación', async ({ page }) => {
    test.setTimeout(900000); // 15 min: en algunos entornos el sync CC/caja tarda más (ej. E,E,E,P)

    await loginAndSeeApp(page);

    const nombreCliente = CLIENTE_CC_COMBINACIONES;
    const tbodyCc = page.locator('#cc-resumen-tbody');
    const logRows = [LOG_HEADERS];
    const rootDir = path.resolve(__dirname, '../..');

    try {
    const filtrarCombinacionId = (process.env.COMBINACION_ID || '').trim(); // ej. COMBINACION_ID="E,P,E,P" (con comillas)
    for (let idx = 0; idx < COMBINACIONES_ESPERADO.length; idx++) {
      const esperado = COMBINACIONES_ESPERADO[idx];
      if (filtrarCombinacionId != null && filtrarCombinacionId !== '' && esperado.id !== filtrarCombinacionId) continue;
      const numComb = COMBINACIONES_ESPERADO.filter(c => !filtrarCombinacionId || c.id === filtrarCombinacionId).indexOf(esperado) + 1;
      const totalComb = filtrarCombinacionId ? 1 : COMBINACIONES_ESPERADO.length;
      console.log(`>>> [CHEQUE-ARS] Combinación ${numComb}/${totalComb} de ${COMBINACIONES_ESPERADO.length}: ${esperado.id}`);
      const estados = [esperado.tx1, esperado.tx2, esperado.tx3, esperado.tx4];
      // Siempre tener el esperado de detalle (aunque no abramos el modal) para log y para no dar PASS falso
      const esperadoSorted = [...(esperado.detalleCliente || [])].sort((a, b) => a - b);
      const esperadoIntSorted = [...(esperado.detalleInt || [])].sort((a, b) => a - b);
      let appSorted = [];
      let appIntSorted = [];

      const STEP_TIMEOUT_MS = 180000; // 3 min por combinación
      try {
      await test.step(`Combinación ${esperado.id}`, async () => {
      const stepDone = Promise.resolve();
      const stepTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Combinación ${esperado.id}: timeout ${STEP_TIMEOUT_MS / 1000}s (revisar CC, modal o cierre de orden).`)), STEP_TIMEOUT_MS);
      });
      await Promise.race([
        stepDone.then(async () => {
      // Limpiar base al inicio de cada combinación para evitar conflictos (una orden nueva por combinación, siempre P,P,P,P).
      console.log(`  [${esperado.id}] Limpiando base E2E...`);
      try {
        execSync('node scripts/limpiar-base-e2e.js', {
          cwd: rootDir,
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'test' },
        });
      } catch (e) {
        if (e.status !== 0) console.warn(`  [${esperado.id}] limpiar-base-e2e falló o no se ejecutó; continuando.`);
      }
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

      // Crear cliente fijo (la limpieza borra clientes E2E)
      await page.locator('#menu-clientes').click();
      await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
      const btnNuevoCliente = page.locator('#btn-nuevo-cliente');
      if ((await btnNuevoCliente.count()) === 0 || !(await btnNuevoCliente.isVisible())) {
        test.skip(true, 'Se necesita permiso abm_clientes y botón Nuevo cliente.');
      }
      await btnNuevoCliente.click();
      await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#cliente-nombre').fill(nombreCliente);
      await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(500);

      // Intermediario único por combinación
      const nombreIntermediario = 'E2E Int ' + Date.now();
      await page.locator('#menu-intermediarios').click();
      await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
      const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
      if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
        test.skip(true, 'Se necesita permiso abm_intermediarios y botón Nuevo intermediario.');
      }
      await btnNuevoInt.click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#intermediario-nombre').fill(nombreIntermediario);
      await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(500);

      // Crear orden CHEQUE-ARS con datos fijos e ir a instrumentación (P,P,P,P)
      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      const optChequeArs = page.locator('#orden-tipo-operacion option[data-codigo="CHEQUE-ARS"][data-usa-intermediario="true"]');
      await expect(optChequeArs).toHaveCount(1, { timeout: 5000 });
      const valueChequeArs = await optChequeArs.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueChequeArs);
      await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
      await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });
      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-importe-cheque').fill(String(DATOS_FIJOS.montoRecibido));
      await page.locator('#orden-tasa-descuento-cliente').fill('2,5');
      await page.waitForTimeout(500);
      await page.locator('#orden-tasa-descuento-intermediario').fill('1,5');
      await page.waitForTimeout(300);
      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      let combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(4, { timeout: 20000 });

      const reInt = new RegExp(nombreIntermediario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      // Cambiar solo las Tx que la combinación indica como E, todo en la misma apertura del modal; luego Listo una vez (sin reabrir).
      for (let i = 0; i < 4; i++) {
        if (estados[i] !== 'E') continue;
        const valorActual = await combosEstado.nth(i).inputValue();
        if (valorActual !== 'ejecutada') {
          console.log(`  [${esperado.id}] Tx${i + 1} → ejecutada...`);
          await combosEstado.nth(i).selectOption('ejecutada');
          await esperarActualizacionEstadoOrden(page);
        }
      }
      console.log(`  [${esperado.id}] Listo, cerrando modal...`);
      await page.locator('#orden-btn-cerrar-wizard').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });
      console.log(`  [${esperado.id}] Yendo a CC...`);

      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 5000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
      await page.waitForTimeout(1500);

      // Validar saldo Cliente
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(800);
      const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countCli = await filaCliente.count();
      let saldoClienteARS = 0;
      if (countCli > 0) {
        const celdaArs = filaCliente.first().locator('td:nth-child(4)');
        const texto = await leerSaldoConSigno(celdaArs);
        saldoClienteARS = saldoResumenANumero(texto, false);
      }
      const diffCli = Math.abs(saldoClienteARS - esperado.saldoClienteARS);

      // Validar detalle Cliente: solo desde el modal "Ver detalle" (#cc-detalle-tbody), no desde la vista "Detalle de movimientos".
      if (countCli > 0 && esperado.detalleCliente && esperado.detalleCliente.length >= 0) {
        await filaCliente.first().locator('.btn-ver-detalle').click();
        await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('#modal-cc-detalle-loading')).toBeHidden({ timeout: 15000 });
        await page.waitForSelector('#cc-detalle-tbody tr:nth-of-type(1)', { timeout: 10000 });
        const numFilasAppCli = await page.locator('#cc-detalle-tbody tr').count();
        const filasDetalle = page.locator('#cc-detalle-tbody tr');
        const montosApp = [];
        for (let f = 0; f < numFilasAppCli; f++) {
          const celdaArs = filasDetalle.nth(f).locator('td:nth-child(7)');
          const texto = await leerSaldoConSigno(celdaArs);
          if (texto !== '–' && /\d/.test(texto)) {
            montosApp.push(saldoLeidoANumero(texto));
          }
        }
        await page.locator('#modal-cc-detalle-close').click();
        await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
        appSorted = [...montosApp].sort((a, b) => a - b);
      }

      // Validar saldo Intermediario (la app muestra verde = DB negativo → invertir signo al leer)
      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(800);
      const filasInt = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="intermediario"]') }).filter({ hasText: reInt });
      const countInt = await filasInt.count();
      let saldoIntARS = 0;
      if (countInt > 0) {
        const celdaArs = filasInt.first().locator('td:nth-child(4)');
        const texto = await leerSaldoConSigno(celdaArs);
        saldoIntARS = saldoResumenANumero(texto, true);
      }
      const diffInt = Math.abs(saldoIntARS - esperado.saldoIntARS);

      // Validar detalle Intermediario: solo desde el modal "Ver detalle" (#cc-detalle-tbody).
      if (countInt > 0 && esperado.detalleInt && esperado.detalleInt.length >= 0) {
        await filasInt.first().locator('.btn-ver-detalle').click();
        await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('#modal-cc-detalle-loading')).toBeHidden({ timeout: 15000 });
        const numEsperadoFilasInt = esperado.detalleInt.length;
        await page.waitForSelector('#cc-detalle-tbody tr:nth-of-type(1)', { timeout: 10000 });
        await expect(
          page.locator('#cc-detalle-tbody tr').first().locator('td:nth-child(7)').locator('span.valor-negativo, span.valor-positivo'),
          `Combinación ${esperado.id}: detalle intermediario - no se encontró celda monto ARS en la primera fila (¿detalle vacío?)`
        ).toBeVisible({ timeout: 5000 });
        const numFilasAppInt = await page.locator('#cc-detalle-tbody tr').count();
        const filasDetalleInt = page.locator('#cc-detalle-tbody tr');
        const montosAppInt = [];
        for (let f = 0; f < numFilasAppInt; f++) {
          const celdaArs = filasDetalleInt.nth(f).locator('td:nth-child(7)');
          const texto = await leerSaldoConSigno(celdaArs);
          if (texto !== '–' && /\d/.test(texto)) {
            montosAppInt.push(saldoLeidoANumero(texto));
          }
        }
        await page.locator('#modal-cc-detalle-close').click();
        await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
        appIntSorted = [...montosAppInt].sort((a, b) => a - b);
      }

      const saldoCliEsperadoCero = Math.abs(Number(esperado.saldoClienteARS) || 0) <= 1;
      const saldoIntEsperadoCero = Math.abs(Number(esperado.saldoIntARS) || 0) <= 1;
      // Si en Resumen no hay fila (saldo 0) pero sí detalle esperado: mismo pantallazo, clic en "Detalle de movimientos" (Tipo Cliente o Intermediario) y leer la tabla para rellenar Real en el log. Lo mismo para cliente y para intermediario.
      if (countCli === 0 && saldoCliEsperadoCero && (esperado.detalleCliente || []).length > 0) {
        const leido = await leerMontosDesdeVistaDetalle(page, 'cliente', nombreCliente);
        if (leido.length > 0) appSorted = leido;
      }
      if (countInt === 0 && saldoIntEsperadoCero && (esperado.detalleInt || []).length > 0) {
        const leido = await leerMontosDesdeVistaDetalle(page, 'intermediario', nombreIntermediario);
        if (leido.length > 0) appIntSorted = leido;
      }
      // Log a Excel: expectativa, real, resultado (PASS/ERR/N/A). Detalle desde modal "Ver detalle" o desde vista "Detalle de movimientos" si no hay fila (saldo 0).
      const resSaldoCli = diffCli <= 1 ? 'PASS' : 'ERR';
      const resSaldoInt = diffInt <= 1 ? 'PASS' : 'ERR';
      let resDetalleCli = 'ERR';
      if (esperadoSorted.length === 0) resDetalleCli = 'PASS';
      else if (countCli === 0 && saldoCliEsperadoCero) resDetalleCli = 'PASS'; // sin fila porque saldo 0 (resumen oculta la fila)
      else if (countCli === 0) resDetalleCli = 'N/A';
      else if (appSorted.length === esperadoSorted.length && esperadoSorted.every((v, i) => Math.abs((appSorted[i] || 0) - v) <= 1)) resDetalleCli = 'PASS';
      let resDetalleInt = 'ERR';
      if (esperadoIntSorted.length === 0) resDetalleInt = 'PASS';
      else if (countInt === 0 && saldoIntEsperadoCero) resDetalleInt = 'PASS'; // sin fila porque saldo 0
      else if (countInt === 0) resDetalleInt = 'N/A';
      else if (appIntSorted.length === esperadoIntSorted.length && esperadoIntSorted.every((v, i) => Math.abs((appIntSorted[i] || 0) - v) <= 1)) resDetalleInt = 'PASS';
      // Control caja efectivo (Tx2, Tx4) y cheque (Tx1 ingreso, Tx3 egreso). Si esperado ≠ 0 y la primera lectura da 0, reintentar tras 3s.
      const expSdoCE = Number(esperado.saldoCajaEfectivoARS) || 0;
      let realSaldoCE = await leerSaldoCajaEfectivoARS(page);
      if (expSdoCE !== 0 && realSaldoCE === 0) {
        await page.waitForTimeout(3000);
        realSaldoCE = await leerSaldoCajaEfectivoARS(page);
      }
      const diffCE = Math.abs(realSaldoCE - expSdoCE);
      const saldoCE_Rdo = diffCE <= 1 ? 'PASS' : 'ERR';
      // Control caja cheque: +mr si Tx1 E, −mr si Tx3 E.
      const expSdoCCh = Number(esperado.saldoCajaChequeARS) ?? 0;
      const realSaldoCCh = await leerSaldoCajaChequeARS(page);
      const diffCCh = Math.abs(realSaldoCCh - expSdoCCh);
      const saldoCCh_Rdo = diffCCh <= 1 ? 'PASS' : 'ERR';
      logRows.push([
        esperado.id,
        esperado.saldoClienteARS, saldoClienteARS, resSaldoCli,
        esperado.saldoIntARS, saldoIntARS, resSaldoInt,
        JSON.stringify(esperado.detalleCliente || []), JSON.stringify(appSorted), resDetalleCli,
        JSON.stringify(esperado.detalleInt || []), JSON.stringify(appIntSorted), resDetalleInt,
        expSdoCE, realSaldoCE, saldoCE_Rdo,
        expSdoCCh, realSaldoCCh, saldoCCh_Rdo,
      ]);

      // Asserts
      expect(diffCli, `Combinación ${esperado.id}: saldo CC cliente esperado ${esperado.saldoClienteARS}, app ${saldoClienteARS}`).toBeLessThanOrEqual(1);
      if (countCli > 0 && esperado.detalleCliente && esperado.detalleCliente.length >= 0) {
        expect(appSorted.length, `Combinación ${esperado.id}: detalle cliente: cantidad esperada ${esperadoSorted.length}, app ${appSorted.length}`).toBe(esperadoSorted.length);
        for (let i = 0; i < esperadoSorted.length; i++) {
          const diff = Math.abs((appSorted[i] || 0) - (esperadoSorted[i] || 0));
          expect(diff, `Combinación ${esperado.id}: detalle cliente monto ${i + 1} esperado ${esperadoSorted[i]}, app ${appSorted[i]}`).toBeLessThanOrEqual(1);
        }
      }
      if (countInt === 0 && esperado.saldoIntARS !== 0) {
        expect(countInt, `Combinación ${esperado.id}: se esperaba saldo int ${esperado.saldoIntARS}, no hay fila de intermediario`).toBeGreaterThan(0);
      }
      const hintReglasInt = '';
      expect(
        diffInt,
        `Combinación ${esperado.id}: saldo CC intermediario esperado ${esperado.saldoIntARS}, app ${saldoIntARS}.${hintReglasInt}`
      ).toBeLessThanOrEqual(1);
      if (countInt > 0 && esperado.detalleInt && esperado.detalleInt.length >= 0) {
        expect(appIntSorted.length, `Combinación ${esperado.id}: detalle intermediario: cantidad esperada ${esperadoIntSorted.length}, app ${appIntSorted.length}`).toBe(esperadoIntSorted.length);
        for (let i = 0; i < esperadoIntSorted.length; i++) {
          const diff = Math.abs((appIntSorted[i] || 0) - (esperadoIntSorted[i] || 0));
          expect(diff, `Combinación ${esperado.id}: detalle int monto ${i + 1} esperado ${esperadoIntSorted[i]}, app ${appIntSorted[i]}`).toBeLessThanOrEqual(1);
        }
      }
      expect(diffCE, `Combinación ${esperado.id}: saldo caja efectivo ARS esperado ${expSdoCE}, app ${realSaldoCE}`).toBeLessThanOrEqual(1);
      expect(diffCCh, `Combinación ${esperado.id}: saldo caja cheque ARS esperado ${expSdoCCh}, app ${realSaldoCCh}`).toBeLessThanOrEqual(1);
      console.log(`    ✓ [CHEQUE-ARS] ${esperado.id} OK (${numComb}/${totalComb})\n`);
        }),
        stepTimeout,
      ]);
      }); // fin test.step Combinación
      } catch (err) {
        console.error(`    ✗ [CHEQUE-ARS] ${esperado.id} FALLÓ (${numComb}/${totalComb})`);
        throw err;
      }
    }
    const finChequeMsg = filtrarCombinacionId
      ? '\n======== [E2E 1/5] CHEQUE-ARS: fin (ejecución filtrada) ========\n'
      : '\n======== [E2E 1/5] CHEQUE-ARS: fin de las 12 combinaciones ========\n';
    console.log(finChequeMsg);
    } finally {
      escribirLogExcel(logRows);
    }
  });
});
