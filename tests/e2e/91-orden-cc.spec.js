// @ts-check
const { test, expect } = require('@playwright/test');
const { initLog, setNroOrdenInterno, logStep, logTransaccion, logCajaControl, writeLogToExcel } = require('./e2e-log-excel');
const { limpiarBaseE2eDesdeTests } = require('./e2e-limpiar-base');

/** No coincide con `clientes.nombre LIKE 'E2E %'` en rpc_limpiar_base_e2e: sobrevive a limpiarBaseE2eDesdeTests(). */
const CLIENTE_PLAYWRIGHT_91_RESERVA = 'Cliente Playwright 91';

/**
 * Tras truncar + DELETE E2E %, el combo de nueva orden puede quedar solo con «Sin asignar».
 * Crea un cliente estable para los specs que no usan el cliente fijo CHEQUE.
 */
async function asegurarClienteReservaPlaywright91(page) {
  await page.locator('#menu-clientes').click();
  await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
  const fila = page.locator('#clientes-tbody tr').filter({ hasText: CLIENTE_PLAYWRIGHT_91_RESERVA });
  if ((await fila.count()) > 0) return;
  const btnNuevo = page.locator('#btn-nuevo-cliente');
  if ((await btnNuevo.count()) === 0 || !(await btnNuevo.isVisible())) return;
  await btnNuevo.click();
  await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
  await page.locator('#cliente-nombre').fill(CLIENTE_PLAYWRIGHT_91_RESERVA);
  await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
  await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
  await page.waitForTimeout(400);
}

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

/** Entero aleatorio entre min y max (inclusive). */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** Número con un decimal, formato es-AR (coma). */
function randomTasa(min, max) {
  const n = min + Math.random() * (max - min);
  return n.toFixed(1).replace('.', ',');
}

/**
 * Después de cambiar estado a "ejecutada" en el wizard, espera a que el backend termine
 * (mensaje "Actualizando estado…" desaparece y los combos se habilitan).
 */
async function esperarActualizacionEstadoOrden(page, timeoutMs = 35000) {
  const msg = page.locator('#orden-inst-actualizando-msg');
  await msg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await msg.waitFor({ state: 'hidden', timeout: timeoutMs });
}

/**
 * Reversa una transacción de ejecutada a pendiente en el wizard: selecciona "pendiente",
 * acepta el modal de confirmación "Sí, reversar" y espera a que termine la actualización.
 * Requiere app_config reversar_max_veces >= 1 (si es 0, el modal mostrará "No está permitido reversar").
 */
async function reversarTransaccionEnWizard(page, combosEstado, indexCombo, timeoutActualizacion = 35000) {
  await combosEstado.nth(indexCombo).selectOption('pendiente');
  await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /sí, reversar/i }).click();
  await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 5000 });
  await expect(combosEstado.nth(indexCombo)).toHaveValue('pendiente', { timeout: 5000 });
  await esperarActualizacionEstadoOrden(page, timeoutActualizacion);
}

/** Hace login y deja la app en estado listo (sidebar + app-content visibles). Idéntico a 01-cc-combinaciones para evitar frenos por diferencia de flujo. */
async function loginAndSeeApp(page) {
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-email').fill(TEST_USER_EMAIL);
  await page.locator('#login-password').fill(TEST_USER_PASSWORD);
  await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();
  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 20000 });
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#app-content')).toBeVisible({ timeout: 5000 });
}

/**
 * Lee el saldo de una celda de CC (por índice: 2=USD, 3=EUR, 4=ARS). La app usa valor-positivo/valor-negativo.
 * @param {import('@playwright/test').Locator} celda - Locator del td (ej. fila.locator('td:nth-child(4)')).
 */
async function leerSaldoConSigno(celda) {
  const spanNeg = celda.locator('span.valor-negativo').first();
  const spanPos = celda.locator('span.valor-positivo').first();
  const existeNeg = (await spanNeg.count()) > 0;
  const existePos = (await spanPos.count()) > 0;
  if (existeNeg) {
    const t = (await spanNeg.textContent())?.trim() || '';
    return t ? '-' + t : '–';
  }
  if (existePos) {
    const t = (await spanPos.textContent())?.trim() || '';
    return t ? '+' + t : '–';
  }
  const t = (await celda.textContent())?.trim() || '';
  return t && /\d/.test(t) ? t : '–';
}

/** Normaliza string de monto (ej. "1.234,56" o "-166.981,23") a número. Formato ES: punto miles, coma decimal. */
function normalizarMontoSaldo(s) {
  if (s === '–' || s === '' || s == null) return 0;
  const t = String(s).replace(/^[\s+\-\u2212]+/, '').replace(/\u2212/g, '-').trim();
  if (!t) return 0;
  const normalizado = t.replace(/\./g, '').replace(',', '.');
  const n = Number(normalizado);
  return isNaN(n) ? 0 : n;
}

/** Igual que 01-cc-combinaciones: string de celda CC (+/− y formato AR) → número con signo. */
function saldoLeidoANumero(saldoStr) {
  if (saldoStr === '–' || saldoStr === '' || saldoStr == null) return 0;
  const neg = /^-|−/.test(String(saldoStr));
  const abs = normalizarMontoSaldo(saldoStr);
  return neg ? -abs : abs;
}

/**
 * Devuelve la fila de CC (cliente) cuyo nombre en la primera celda coincide con nombreCliente (exacto tras trim).
 * Evita emparejar otro cliente cuando el nombre es substring (ej. "Juan" vs "Juan Perez").
 * Si no hay match, devuelve un locator vacío (count 0) dentro del tbody.
 */
async function obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente) {
  const nombre = (nombreCliente || '').trim();
  const rows = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') });
  if (!nombre) return rows;
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cellText = (await rows.nth(i).locator('td').first().textContent())?.trim() || '';
    if (cellText === nombre) return rows.nth(i);
  }
  return tbodyCc.locator('tr').filter({ hasText: 'nunca-coincide-e2e-' + nombre }); // vacío si no hay match
}

/**
 * Espera hasta que la CC muestre saldo 0 para el cliente: o no hay fila (app oculta saldo 0) o la celda es 0/–.
 * Hace polling cada 1s. Útil tras ejecutar la segunda transacción (Pandy→Cliente).
 * @returns {Promise<boolean>} true si llegó a saldo 0 dentro del timeout.
 */
async function esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, columnaMoneda, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.locator('#cc-btn-refrescar').click();
    await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
    await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
    await page.waitForTimeout(1500);
    const fila = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
    const count = await fila.count();
    if (count === 0) return true;
    const celda = fila.first().locator(`td:nth-child(${columnaMoneda})`);
    const saldo = await leerSaldoConSigno(celda);
    if (normalizarMontoSaldo(saldo) === 0 || saldo === '–') return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

/** Reabre la orden por nombre de cliente y va a instrumentación. */
async function reopenOrderAndGoToInstrumentacion(page, nombreCliente) {
  await page.locator('#menu-ordenes').click();
  await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#ordenes-tbody tr').filter({ hasText: nombreCliente.trim() }).first()).toBeVisible({ timeout: 10000 });
  await page.locator('#ordenes-tbody tr').filter({ hasText: nombreCliente.trim() }).first().locator('.btn-editar-orden').click();
  await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
  await page.locator('#orden-btn-next').click();
  await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });
  await page.locator('#orden-btn-ir-instrumentacion').click();
  await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
}

/** Parsea texto de saldo (ej. "202.000" o "202.000,50") a número; si el elemento tiene clase negativo, devuelve negativo. */
function parseSaldoCajaDisplay(texto, esNegativo) {
  if (texto === '–' || texto === '' || !/\d/.test(String(texto))) return 0;
  const t = String(texto).replace(/\./g, '').replace(',', '.').trim();
  const n = Number(t);
  return isNaN(n) ? 0 : (esNegativo ? -n : n);
}

/**
 * Va a Cajas, espera a que termine la carga (saldos actualizados) y lee los saldos.
 * Devuelve { ok, efUsd, efArs, efEur, baUsd, baArs, efArsNum } (efArsNum = saldo efectivo ARS con signo para control Exp_Sdo_CE/Real_Sdo_CE).
 */
async function irACajasYLeerSaldos(page) {
  await page.locator('#menu-cajas').click();
  await expect(page.locator('#vista-cajas')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cajas-saldos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cajas-loading')).toBeHidden({ timeout: 20000 });
  const elArs = page.locator('#cajas-saldo-efectivo-ars');
  const efArs = (await elArs.textContent())?.trim() || '–';
  const efArsNeg = await elArs.evaluate((node) => node.classList.contains('negativo'));
  const efArsNum = parseSaldoCajaDisplay(efArs, efArsNeg);
  const efUsd = (await page.locator('#cajas-saldo-efectivo-usd').textContent())?.trim() || '–';
  const efEur = (await page.locator('#cajas-saldo-efectivo-eur').textContent())?.trim() || '–';
  const baUsd = (await page.locator('#cajas-saldo-banco-usd').textContent())?.trim() || '–';
  const baArs = (await page.locator('#cajas-saldo-banco-ars').textContent())?.trim() || '–';
  return { ok: true, efUsd, efArs, efEur, baUsd, baArs, efArsNum };
}

/** Cliente fijo para test CHEQUE-ARS individual. Arranque limpio = anular todas sus órdenes antes de crear una (igual que 01-cc-combinaciones). */
const CLIENTE_ORDEN_CC_CHEQUE_ARS = 'E2E Orden CC Individual';

test.describe('Orden CHEQUE-ARS, transacciones y cuenta corriente', () => {
  test.beforeAll(() => {
    console.log('\n======== [E2E 5/5] Flujos orden-cc (CHEQUE-ARS, ARS-USD, USD-ARS, USD-USD, reversa) — 91-orden-cc.spec.js ========\n');
  });
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden CHEQUE-ARS, ejecutar transacciones y verificar que CC refleja cada paso', async ({ page }) => {
    test.setTimeout(180000);
    initLog('CHEQUE-ARS');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');

      // Arranque limpio igual que 01-cc-combinaciones: anular todas las órdenes del cliente fijo para que al reabrir haya una sola orden
      const nombreCliente = CLIENTE_ORDEN_CC_CHEQUE_ARS;
      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#ordenes-tbody')).toBeVisible({ timeout: 10000 });
      for (let i = 0; i < 15; i++) {
        const fila = page.locator('#ordenes-tbody tr').filter({ hasText: nombreCliente }).first();
        const btnAnular = fila.locator('.btn-anular-orden-tabla');
        if ((await btnAnular.count()) === 0 || !(await btnAnular.isVisible())) break;
        await btnAnular.click();
        await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /anular orden/i }).click();
        await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(1500);
      }

      await page.locator('#menu-clientes').click();
      await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
      const filasCliente = page.locator('#clientes-tbody tr').filter({ hasText: nombreCliente });
      if ((await filasCliente.count()) === 0) {
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
      }

      const nombreIntermediario = 'E2E Int ' + Date.now();
      await page.locator('#menu-intermediarios').click();
      await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
      const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
      if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
        test.skip(true, 'Se necesita permiso abm_intermediarios y botón Nuevo intermediario para CHEQUE-ARS.');
      }
      await btnNuevoInt.click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#intermediario-nombre').fill(nombreIntermediario);
      await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(500);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optChequeArs = page.locator('#orden-tipo-operacion option[data-codigo="CHEQUE-ARS"][data-usa-intermediario="true"]');
      await expect(optChequeArs).toHaveCount(1, { timeout: 5000 });
      const valueChequeArs = await optChequeArs.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueChequeArs);
      await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
      await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });
      logStep('2', 'Tipo CHEQUE-ARS, cliente e intermediario seleccionados', 'Paso Detalles visible', 'expect #orden-step-detalles visible', 'OK', `Cliente: ${nombreCliente}, Int: ${nombreIntermediario}`);

      await page.locator('#orden-importe-cheque').fill('200000');
      await page.locator('#orden-tasa-descuento-cliente').fill('2,5');
      await page.waitForTimeout(500);
      await page.locator('#orden-tasa-descuento-intermediario').fill('1,5');
      await page.waitForTimeout(300);

      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || '200000';
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const mrNum = parseFloat(String(montoRecibido).replace(/\./g, '').replace(',', '.')) || 200000;
      const meNum = parseFloat(String(montoEntregado).replace(/\./g, '').replace(',', '.')) || 195000;
      const montoEfectivoInt = Math.round(mrNum * 0.985) || 197000;
      const montoEfectivoIntStr = String(montoEfectivoInt);
      // Tras Tx1..Tx4 ejecutadas: efectivo −me + efectivo int.; cheque +mr −mr (Tx3 egreso cheque).
      const espEfArsPorPaso = [0, -meNum, -meNum, -meNum + montoEfectivoInt];
      const espBaArsPorPaso = [mrNum, mrNum, 0, 0];
      const fmtEsp = (n) => (typeof n === 'number' && !isNaN(n) ? String(Math.round(n)) : '');

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      let combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(4);

      const tbodyCc = page.locator('#cc-resumen-tbody');
      const reCliente = nombreCliente ? new RegExp(nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;
      const reInt = nombreIntermediario ? new RegExp(nombreIntermediario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;

      const tituloOrden = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNro = tituloOrden.match(/#(\d+)/);
      if (matchNro) setNroOrdenInterno(matchNro[1]);
      const idsTransaccion = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id') || ''));
      const numerosTransaccion = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-numero') || ''));

      const estados = ['E', 'E', 'E', 'E'];
      for (let i = 0; i < 4; i++) {
        const valorQuerido = estados[i] === 'E' ? 'ejecutada' : 'pendiente';
        const valorActual = await combosEstado.nth(i).inputValue();
        if (valorActual !== valorQuerido) {
          await combosEstado.nth(i).selectOption(valorQuerido);
          if (valorQuerido === 'pendiente') {
            await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 10000 }).catch(() => {});
            await page.getByRole('button', { name: /sí, reversar/i }).click().catch(() => {});
            await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 5000 }).catch(() => {});
          }
          await esperarActualizacionEstadoOrden(page);
        }
        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });
        if (i < 3) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
          combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
          await expect(combosEstado).toHaveCount(4);
        }
      }

      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.waitForTimeout(1500);

      logStep('3', 'Datos CHEQUE-ARS e Ir a instrumentación', 'Paso Instrumentación con 4 transacciones (Cliente↔Pandy y Pandy↔Intermediario)', 'expect 4 filas con combo estado', 'OK', 'Instrumentación explícita momento cero; no compensatorias automáticas al editar.');
      // Con las 4 ejecutadas, CC cliente e intermediario deben cerrar en 0
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(800);
      let filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countCliente = await filaCliente.count();
      let saldoCliente = '–';
      if (countCliente > 0) {
        const celdaArsCliente = filaCliente.first().locator('td:nth-child(4)');
        saldoCliente = await leerSaldoConSigno(celdaArsCliente);
      }
      const clienteCero = countCliente === 0 || saldoCliente === '–' || normalizarMontoSaldo(saldoCliente) === 0;
      expect(clienteCero, `Tras 4 ejecutadas CC cliente debe ser 0. Se capturó: ${saldoCliente}, filas: ${countCliente}`).toBe(true);

      const spreadComisionCcClienteEsperada = Math.round(mrNum - meNum);
      await page.locator('#cc-tab-movimientos').click();
      await expect(page.locator('#cc-panel-movimientos')).toBeVisible({ timeout: 5000 });
      await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
      await page.locator('#cc-btn-refrescar-movimientos').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.waitForTimeout(800);
      await page.locator('#cc-detalle-entidad-select').selectOption({ label: nombreCliente }).catch(async () => {});
      const filaComisionCheque = page.locator('#cc-vista-detalle-tbody tr').filter({ hasText: /Comisión del acuerdo/i });
      await expect(filaComisionCheque.first(), 'CHEQUE-ARS+int: fila «Comisión del acuerdo» en Movimientos CC cliente').toBeVisible({ timeout: 15000 });
      const celdaArsComision = filaComisionCheque.first().locator('td').nth(6);
      const textoComisionArs = await leerSaldoConSigno(celdaArsComision);
      const montoComisionLeido = saldoLeidoANumero(textoComisionArs);
      expect(
        Math.abs(montoComisionLeido - spreadComisionCcClienteEsperada),
        `CHEQUE-ARS: CC cliente — comisión en movimientos debe ser mr−me (${spreadComisionCcClienteEsperada}), no la parte neta Pandy en comisiones_orden; leído: ${textoComisionArs} → ${montoComisionLeido}`
      ).toBeLessThanOrEqual(1);
      await page.locator('#cc-tab-saldos').click();
      await expect(page.locator('#cc-panel-saldos')).toBeVisible({ timeout: 5000 });

      logStep('4.1', 'Paso 1: Cliente paga a Pandy (fila 0)', 'CC cliente con saldo ARS positivo (cliente debe a Pandy).', 'Filtro Cliente; celda ARS', 'OK', '', '0 (final)', numerosTransaccion[0]);
      logTransaccion(1, 'Cliente', 'Pandy', 'ARS', 'Cheque', montoRecibido, '0 (final)', 'OK', numerosTransaccion[0]);
      logStep('4.2', 'Paso 2: Pandy paga al cliente (fila 1)', 'CC cliente cierra en 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoCliente, numerosTransaccion[1]);
      logTransaccion(2, 'Pandy', 'Cliente', 'ARS', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoCliente, 'OK', numerosTransaccion[1]);

      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(800);
      const filaIntBase = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="intermediario"]') }).filter({ hasText: reInt });
      const countInt = await filaIntBase.count();
      let saldoInt = '–';
      if (countInt > 0) {
        const celdaArsInt = filaIntBase.first().locator('td:nth-child(4)');
        saldoInt = await leerSaldoConSigno(celdaArsInt);
      }
      const intCero = countInt === 0 || saldoInt === '–' || normalizarMontoSaldo(saldoInt) === 0;
      expect(intCero, `Tras 4 ejecutadas CC intermediario debe ser 0. Se capturó: ${saldoInt}, filas: ${countInt}`).toBe(true);
      logStep('4.3', 'Paso 3: Pandy paga a Intermediario (fila 2)', 'CC intermediario según reglas.', 'Filtro Intermediario; celda ARS', 'OK', '', '0 (final)', numerosTransaccion[2]);
      logTransaccion(3, 'Pandy', 'Intermediario', 'ARS', 'Cheque', montoRecibido, '0 (final)', 'OK', numerosTransaccion[2]);
      logStep('4.4', 'Paso 4: Intermediario paga a Pandy (fila 3)', 'CC intermediario cierra en 0.', 'Filtro Intermediario', 'OK', '', countInt === 0 ? '0 (sin fila)' : saldoInt, numerosTransaccion[3]);
      logTransaccion(4, 'Intermediario', 'Pandy', 'ARS', 'Efectivo', montoEfectivoIntStr, countInt === 0 ? '0' : saldoInt, 'OK', numerosTransaccion[3]);

      // Control de caja: una lectura por paso (4 transacciones ejecutadas en secuencia).
      for (let i = 0; i < 4; i++) {
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          const expCE = espEfArsPorPaso[i];
          const saldoCE_Rdo = Math.abs((saldos.efArsNum ?? 0) - expCE) <= 1 ? 'PASS' : 'ERR';
          logCajaControl({
            efectivo: {
              USD: { app: saldos.efUsd, resultado: res },
              ARS: { esp: fmtEsp(expCE), app: saldos.efArs, resultado: res },
              EUR: { app: saldos.efEur, resultado: res },
            },
            banco: {
              USD: { app: saldos.baUsd, resultado: res },
              ARS: { esp: fmtEsp(espBaArsPorPaso[i]), app: saldos.baArs, resultado: res },
            },
            nroTransaccionInterno: numerosTransaccion[i] || '',
            expSdoCE: expCE,
            realSdoCE: saldos.efArsNum,
            saldoCE_Rdo,
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { esp: fmtEsp(espEfArsPorPaso[i]), app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { esp: fmtEsp(espBaArsPorPaso[i]), app: '–', resultado: 'err' } },
            nroTransaccionInterno: numerosTransaccion[i] || '',
            expSdoCE: espEfArsPorPaso[i],
            realSdoCE: '',
            saldoCE_Rdo: 'ERR',
          });
        }
      }

      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
      logStep('5', 'Verificación final CC', 'Con las 4 transacciones ejecutadas el saldo en ambas CC es 0.', 'Vista CC carga; filtros Cliente e Intermediario con tabla visible', 'OK');

      // Paso 6: Control de caja final
      let controlCajaOk = false;
      let controlCajaError = '';
      let montosEfectivo = 'No capturado';
      let montosBanco = 'No capturado';
      let efUsd = '–', efArs = '–', efEur = '–', baUsd = '–', baArs = '–';
      let efArsNum = 0;
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        efArsNum = saldos.efArsNum ?? 0;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const res = controlCajaOk ? 'OK' : 'err';
      const expCE = espEfArsPorPaso[3];
      const saldoCE_Rdo = controlCajaOk && Math.abs(efArsNum - expCE) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: {
          USD: { app: efUsd, resultado: res },
          ARS: { esp: fmtEsp(expCE), app: efArs, resultado: res },
          EUR: { app: efEur, resultado: res },
        },
        banco: {
          USD: { app: baUsd, resultado: res },
          ARS: { esp: fmtEsp(espBaArsPorPaso[3]), app: baArs, resultado: res },
        },
        expSdoCE: expCE,
        realSdoCE: controlCajaOk ? efArsNum : '',
        saldoCE_Rdo,
      });
      logStep('6.1', 'Control caja Efectivo', 'Saldos Efectivo visibles (USD, ARS, EUR).', 'Montos leídos de #cajas-saldo-efectivo-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosEfectivo : controlCajaError);
      logStep('6.2', 'Control caja Banco', 'Saldos Banco visibles (USD, ARS).', 'Montos leídos de #cajas-saldo-banco-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosBanco : controlCajaError);
      if (!controlCajaOk) throw new Error(controlCajaError);
      expect(Math.abs(efArsNum - expCE), `Saldo caja efectivo ARS esperado ${expCE}, real ${efArsNum}`).toBeLessThanOrEqual(1);
    } catch (err) {
      logStep('Error', 'Test falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});

test.describe('Orden ARS-USD, transacciones y cuenta corriente', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden ARS-USD (sin intermediario), ejecutar 2 transacciones y verificar CC cliente', async ({ page }) => {
    test.setTimeout(120000);
    initLog('ARS-USD');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');
      await asegurarClienteReservaPlaywright91(page);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      // Misma clave que catálogo: codigo + usa_intermediario (hay ARS-USD sin y con intermediario).
      const optArsUsd = page.locator('#orden-tipo-operacion option[data-codigo="ARS-USD"][data-usa-intermediario="false"]');
      await expect(optArsUsd).toHaveCount(1, { timeout: 5000 });
      const valueArsUsd = await optArsUsd.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueArsUsd);
      await page.locator('#orden-wrap-intermediario').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteArsUsd = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteArsUsd });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      logStep('2', 'Tipo ARS-USD, cliente seleccionado, sin intermediario', 'Paso Detalles visible', 'expect #orden-step-detalles visible', 'OK', `Cliente: ${nombreCliente}`);

      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 2000 });
      const cotizArsUsd = randomInt(800, 1200);
      const montoEntregadoUsd = randomInt(500, 1500);
      const montoRecibidoArsUsd = cotizArsUsd * montoEntregadoUsd;
      await page.locator('#orden-cotizacion').fill(String(cotizArsUsd));
      await page.locator('#orden-monto-entregado').fill(String(montoEntregadoUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || '';
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || String(montoEntregadoUsd);

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(2, { timeout: 20000 });

      const tituloOrdenArsUsd = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNroArsUsd = tituloOrdenArsUsd.match(/#(\d+)/);
      if (matchNroArsUsd) setNroOrdenInterno(matchNroArsUsd[1]);
      const idsTransaccionArsUsd = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id') || ''));
      const numerosTransaccionArsUsd = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-numero') || ''));

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(2);
      logStep('3', 'ARS-USD: cotización 1000, recibir 1.000.000 ARS, entregar USD', 'Paso Instrumentación con 2 transacciones (ingreso ARS, egreso USD)', 'expect 2 filas', 'OK', '');

      const tbodyCc = page.locator('#cc-resumen-tbody');
      const reCliente = nombreCliente ? new RegExp(nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;

      for (let i = 0; i < 2; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(combosEstado.nth(i)).toHaveValue('ejecutada', { timeout: 5000 });
        await esperarActualizacionEstadoOrden(page);

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
        if (i === 0) {
          await page.waitForTimeout(2500);
          await page.locator('#cc-btn-refrescar').click();
          await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        }

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        let filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        if (i === 1) await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 2, 20000);
        if (i === 1) filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        const countCliente = await filaCliente.count();
        let saldoMoneda = '–';
        // Tras tr1 la obligación pendiente es en USD (Pandy debe entregar 1000 USD). Tras tr2 todo en 0. Leemos columna USD (2).
        const columnaMoneda = 2;
        if (countCliente > 0) {
          await expect(filaCliente.first()).toBeVisible({ timeout: 5000 });
          const celda = filaCliente.first().locator(`td:nth-child(${columnaMoneda})`);
          await expect(celda).toContainText(/\d|\–/);
          saldoMoneda = await leerSaldoConSigno(celda);
        }
        if (i === 0) {
          expect(countCliente > 0, 'Paso 1: debe haber fila del cliente en CC con saldo USD (Pandy debe 1000 USD)').toBe(true);
          logStep('4.1', 'Paso 1: Cliente paga ARS a Pandy (fila 0)', 'CC cliente: saldo USD = -1000 (Pandy debe entregar USD).', 'Filtro Cliente; celda USD', 'OK', '', saldoMoneda, numerosTransaccionArsUsd[0]);
          logTransaccion(1, 'Cliente', 'Pandy', 'ARS', 'Efectivo', montoRecibido, saldoMoneda, 'OK', numerosTransaccionArsUsd[0]);
        } else {
          const esCero = countCliente === 0 || saldoMoneda === '–' || normalizarMontoSaldo(saldoMoneda) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente (USD) la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga USD al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionArsUsd[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'USD', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionArsUsd[1]);
        }

        // Control de caja tras esta transacción (Exp_Sdo_CE / Real_Sdo_CE / Saldo_CE_Rdo: solo efectivo ARS)
        const expCEArsUsd = Number(montoRecibido); // Tx1 ingreso ARS; Tx2 no mueve ARS
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          const saldoCE_Rdo = Math.abs((saldos.efArsNum ?? 0) - expCEArsUsd) <= 1 ? 'PASS' : 'ERR';
          logCajaControl({
            efectivo: { USD: { app: saldos.efUsd, resultado: res }, ARS: { app: saldos.efArs, resultado: res }, EUR: { app: saldos.efEur, resultado: res } },
            banco: { USD: { app: saldos.baUsd, resultado: res }, ARS: { app: saldos.baArs, resultado: res } },
            expSdoCE: expCEArsUsd,
            realSdoCE: saldos.efArsNum,
            saldoCE_Rdo,
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
            expSdoCE: expCEArsUsd,
            realSdoCE: '',
            saldoCE_Rdo: 'ERR',
          });
        }

        if (i < 1) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
        }
      }

      logStep('5', 'Verificación final CC', 'Con las 2 transacciones ejecutadas el saldo CC cliente es 0.', 'Vista CC carga', 'OK');

      // Paso 6: Control de caja final
      let controlCajaOk = false;
      let controlCajaError = '';
      let montosEfectivo = 'No capturado';
      let montosBanco = 'No capturado';
      let efUsd = '–', efArs = '–', efEur = '–', baUsd = '–', baArs = '–';
      let efArsNum = 0;
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        efArsNum = saldos.efArsNum ?? 0;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resArsUsd = controlCajaOk ? 'OK' : 'err';
      const expCEFinalArsUsd = Number(montoRecibido);
      const saldoCE_RdoArsUsd = controlCajaOk && Math.abs(efArsNum - expCEFinalArsUsd) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: { USD: { app: efUsd, resultado: resArsUsd }, ARS: { app: efArs, resultado: resArsUsd }, EUR: { app: efEur, resultado: resArsUsd } },
        banco: { USD: { app: baUsd, resultado: resArsUsd }, ARS: { app: baArs, resultado: resArsUsd } },
        expSdoCE: expCEFinalArsUsd,
        realSdoCE: controlCajaOk ? efArsNum : '',
        saldoCE_Rdo: saldoCE_RdoArsUsd,
      });
      logStep('6.1', 'Control caja Efectivo', 'Saldos Efectivo visibles (USD, ARS, EUR).', 'Montos leídos de #cajas-saldo-efectivo-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosEfectivo : controlCajaError);
      logStep('6.2', 'Control caja Banco', 'Saldos Banco visibles (USD, ARS).', 'Montos leídos de #cajas-saldo-banco-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosBanco : controlCajaError);
      if (!controlCajaOk) throw new Error(controlCajaError);
      expect(Math.abs(efArsNum - expCEFinalArsUsd), `Saldo caja efectivo ARS esperado ${expCEFinalArsUsd}, real ${efArsNum}`).toBeLessThanOrEqual(1);
    } catch (err) {
      logStep('Error', 'Test falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});

test.describe('Orden USD-ARS, transacciones y cuenta corriente (sin intermediario)', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden USD-ARS (sin intermediario), ejecutar 2 transacciones y verificar CC y Cajas', async ({ page }) => {
    test.setTimeout(120000);
    initLog('USD-ARS');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');
      await asegurarClienteReservaPlaywright91(page);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optUsdArs = page.locator('#orden-tipo-operacion option[data-codigo="USD-ARS"][data-usa-intermediario="false"]');
      await expect(optUsdArs).toHaveCount(1, { timeout: 5000 });
      const valueUsdArs = await optUsdArs.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdArs);
      await page.locator('#orden-wrap-intermediario').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteUsdArs = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteUsdArs });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      logStep('2', 'Tipo USD-ARS, cliente seleccionado, sin intermediario', 'Paso Detalles visible', 'expect #orden-step-detalles visible', 'OK', `Cliente: ${nombreCliente}`);

      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 2000 });
      const cotizUsdArs = randomInt(800, 1200);
      const montoRecibidoUsdArs = randomInt(500, 2000);
      await page.locator('#orden-cotizacion').fill(String(cotizUsdArs));
      await page.locator('#orden-monto-recibido').fill(String(montoRecibidoUsdArs));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || String(montoRecibidoUsdArs);
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(2, { timeout: 20000 });

      const tituloOrdenUsdArs = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNroUsdArs = tituloOrdenUsdArs.match(/#(\d+)/);
      if (matchNroUsdArs) setNroOrdenInterno(matchNroUsdArs[1]);
      const idsTransaccionUsdArs = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id') || ''));
      const numerosTransaccionUsdArs = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-numero') || ''));

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(2);
      logStep('3', 'USD-ARS: cotización 1000, recibir 1000 USD, entregar ARS', 'Paso Instrumentación con 2 transacciones (ingreso USD, egreso ARS)', 'expect 2 filas', 'OK', '');

      const tbodyCc = page.locator('#cc-resumen-tbody');
      const reCliente = nombreCliente ? new RegExp(nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;

      for (let i = 0; i < 2; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(combosEstado.nth(i)).toHaveValue('ejecutada', { timeout: 5000 });
        await esperarActualizacionEstadoOrden(page);

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
        if (i === 0) {
          await page.waitForTimeout(2500);
          await page.locator('#cc-btn-refrescar').click();
          await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        }

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        let filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        if (i === 1) await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 4, 20000);
        if (i === 1) filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        const countCliente = await filaCliente.count();
        let saldoMoneda = '–';
        // Tras tr1 la obligación pendiente es en ARS (Pandy debe entregar ARS). Tras tr2 todo en 0. Leemos columna ARS (4).
        const columnaMoneda = 4;
        if (countCliente > 0) {
          await expect(filaCliente.first()).toBeVisible({ timeout: 5000 });
          const celda = filaCliente.first().locator(`td:nth-child(${columnaMoneda})`);
          await expect(celda).toContainText(/\d|\–/);
          saldoMoneda = await leerSaldoConSigno(celda);
        }
        if (i === 0) {
          expect(countCliente > 0, 'Paso 1: debe haber fila del cliente en CC con saldo ARS (Pandy debe entregar ARS)').toBe(true);
          logStep('4.1', 'Paso 1: Cliente paga USD a Pandy (fila 0)', 'CC cliente: saldo ARS = -monto_entregado (Pandy debe entregar ARS).', 'Filtro Cliente; celda ARS', 'OK', '', saldoMoneda, numerosTransaccionUsdArs[0]);
          logTransaccion(1, 'Cliente', 'Pandy', 'USD', 'Efectivo', montoRecibido, saldoMoneda, 'OK', numerosTransaccionUsdArs[0]);
        } else {
          const esCero = countCliente === 0 || saldoMoneda === '–' || normalizarMontoSaldo(saldoMoneda) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente (ARS) la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga ARS al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionUsdArs[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'ARS', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionUsdArs[1]);
        }

        // Control de caja tras esta transacción (Exp_Sdo_CE / Real_Sdo_CE / Saldo_CE_Rdo: solo efectivo ARS)
        const expCEUsdArs = i === 0 ? 0 : -Number(montoEntregado); // Tx1 no ARS; Tx2 egreso ARS
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          const saldoCE_Rdo = Math.abs((saldos.efArsNum ?? 0) - expCEUsdArs) <= 1 ? 'PASS' : 'ERR';
          logCajaControl({
            efectivo: { USD: { app: saldos.efUsd, resultado: res }, ARS: { app: saldos.efArs, resultado: res }, EUR: { app: saldos.efEur, resultado: res } },
            banco: { USD: { app: saldos.baUsd, resultado: res }, ARS: { app: saldos.baArs, resultado: res } },
            expSdoCE: expCEUsdArs,
            realSdoCE: saldos.efArsNum,
            saldoCE_Rdo,
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
            expSdoCE: expCEUsdArs,
            realSdoCE: '',
            saldoCE_Rdo: 'ERR',
          });
        }

        if (i < 1) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
        }
      }

      logStep('5', 'Verificación final CC', 'Con las 2 transacciones ejecutadas el saldo CC cliente es 0.', 'Vista CC carga', 'OK');

      // Paso 6: Control de caja final
      let controlCajaOk = false;
      let controlCajaError = '';
      let montosEfectivo = 'No capturado';
      let montosBanco = 'No capturado';
      let efUsd = '–', efArs = '–', efEur = '–', baUsd = '–', baArs = '–';
      let efArsNum = 0;
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        efArsNum = saldos.efArsNum ?? 0;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resUsdArs = controlCajaOk ? 'OK' : 'err';
      const expCEFinalUsdArs = -Number(montoEntregado);
      const saldoCE_RdoUsdArs = controlCajaOk && Math.abs(efArsNum - expCEFinalUsdArs) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: { USD: { app: efUsd, resultado: resUsdArs }, ARS: { app: efArs, resultado: resUsdArs }, EUR: { app: efEur, resultado: resUsdArs } },
        banco: { USD: { app: baUsd, resultado: resUsdArs }, ARS: { app: baArs, resultado: resUsdArs } },
        expSdoCE: expCEFinalUsdArs,
        realSdoCE: controlCajaOk ? efArsNum : '',
        saldoCE_Rdo: saldoCE_RdoUsdArs,
      });
      logStep('6.1', 'Control caja Efectivo', 'Saldos Efectivo visibles (USD, ARS, EUR).', 'Montos leídos de #cajas-saldo-efectivo-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosEfectivo : controlCajaError);
      logStep('6.2', 'Control caja Banco', 'Saldos Banco visibles (USD, ARS).', 'Montos leídos de #cajas-saldo-banco-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosBanco : controlCajaError);
      if (!controlCajaOk) throw new Error(controlCajaError);
      expect(Math.abs(efArsNum - expCEFinalUsdArs), `Saldo caja efectivo ARS esperado ${expCEFinalUsdArs}, real ${efArsNum}`).toBeLessThanOrEqual(1);
    } catch (err) {
      logStep('Error', 'Test falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});

test.describe('Orden USD-USD, transacciones y cuenta corriente (sin intermediario)', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden USD-USD (sin intermediario), ejecutar 2 transacciones y verificar CC y Cajas', async ({ page }) => {
    test.setTimeout(120000);
    initLog('USD-USD');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');
      await asegurarClienteReservaPlaywright91(page);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optUsdUsd = page.locator('#orden-tipo-operacion option[data-codigo="USD-USD"][data-usa-intermediario="false"]');
      await expect(optUsdUsd).toHaveCount(1, { timeout: 5000 });
      const valueUsdUsd = await optUsdUsd.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdUsd);
      await page.locator('#orden-wrap-intermediario').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteUsdUsd = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteUsdUsd });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('#orden-wrap-primeros-datos')).toBeVisible({ timeout: 2000 });
      const importeUsd = randomInt(2000, 8000);
      const tasaClienteStr = randomTasa(1, 3);
      await page.locator('#orden-importe-cheque').fill(String(importeUsd));
      await page.locator('#orden-tasa-descuento-cliente').fill(tasaClienteStr);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);

      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || String(importeUsd);
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const mrNum = parseFloat(String(montoRecibido).replace(/\./g, '').replace(',', '.')) || 0;
      const meNum = parseFloat(String(montoEntregado).replace(/\./g, '').replace(',', '.')) || 0;
      const comisionPandy = Math.round(mrNum - meNum);
      const fmtEsp = (n) => (typeof n === 'number' && !isNaN(n) ? String(Math.round(n)) : '');
      const espEfUsdPorPaso = [mrNum, comisionPandy];
      const espBaUsdPorPaso = [0, 0];

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(2, { timeout: 20000 });

      const tituloOrdenUsdUsd = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNroUsdUsd = tituloOrdenUsdUsd.match(/#(\d+)/);
      if (matchNroUsdUsd) setNroOrdenInterno(matchNroUsdUsd[1]);
      const numerosTransaccionUsdUsd = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-numero') || ''));

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(2);
      logStep('3', 'USD-USD: importe y tasa, 2 transacciones (ingreso y egreso efectivo)', 'Paso Instrumentación con 2 filas', 'expect 2 filas', 'OK', '');

      const tbodyCc = page.locator('#cc-resumen-tbody');
      const reCliente = nombreCliente ? new RegExp(nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;

      for (let i = 0; i < 2; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(combosEstado.nth(i)).toHaveValue('ejecutada', { timeout: 5000 });
        await esperarActualizacionEstadoOrden(page);

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
        if (i === 0) {
          await page.waitForTimeout(2500);
          await page.locator('#cc-btn-refrescar').click();
          await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        }

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        let filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        if (i === 1) await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 2, 20000);
        if (i === 1) filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
        const countCliente = await filaCliente.count();
        let saldoMoneda = '–';
        const columnaMoneda = 2;
        if (countCliente > 0) {
          await expect(filaCliente.first()).toBeVisible({ timeout: 5000 });
          const celda = filaCliente.first().locator(`td:nth-child(${columnaMoneda})`);
          await expect(celda).toContainText(/\d|\–/);
          saldoMoneda = await leerSaldoConSigno(celda);
        }
        if (i === 0) {
          expect(countCliente > 0, 'Paso 1: debe haber fila del cliente en CC con saldo USD').toBe(true);
          logStep('4.1', 'Paso 1: Cliente paga USD a Pandy (fila 0)', 'CC cliente: saldo USD positivo (cliente debe a Pandy).', 'Filtro Cliente; celda USD', 'OK', '', saldoMoneda, numerosTransaccionUsdUsd[0]);
          logTransaccion(1, 'Cliente', 'Pandy', 'USD', 'Efectivo', montoRecibido, saldoMoneda, 'OK', numerosTransaccionUsdUsd[0]);
        } else {
          const esCero = countCliente === 0 || saldoMoneda === '–' || normalizarMontoSaldo(saldoMoneda) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga USD al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionUsdUsd[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'USD', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionUsdUsd[1]);

          // Validar que en Movimientos de CC quede visible la comisión explícita de USD-USD.
          await page.locator('#cc-vista-toggle button[data-vista="detalle"]').click();
          await expect(page.locator('#cc-detalle-wrap')).toBeVisible({ timeout: 5000 });
          await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
          await page.locator('#cc-detalle-entidad-select').selectOption({ label: nombreCliente }).catch(async () => {
            const val = await page.locator('#cc-detalle-entidad-select option').filter({ hasText: nombreCliente }).first().getAttribute('value');
            if (val) await page.locator('#cc-detalle-entidad-select').selectOption(val);
          });
          await page.waitForTimeout(700);
          const filaComision = page.locator('#cc-vista-detalle-tbody tr')
            .filter({ hasText: /comisi[oó]n del acuerdo/i })
            .filter({ hasText: nombreCliente });
          await expect(filaComision.first(), 'USD-USD: debe existir movimiento "Comisión del acuerdo" en CC Movimientos').toBeVisible({ timeout: 12000 });
          await page.locator('#cc-vista-toggle button[data-vista="resumen"]').click();
          await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        }

        // Control caja efectivo ARS: USD-USD no mueve ARS → Exp_Sdo_CE = 0
        const expCEUsdUsd = 0;
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          const saldoCE_Rdo = Math.abs((saldos.efArsNum ?? 0) - expCEUsdUsd) <= 1 ? 'PASS' : 'ERR';
          logCajaControl({
            efectivo: {
              USD: { esp: fmtEsp(espEfUsdPorPaso[i]), app: saldos.efUsd, resultado: res },
              ARS: { app: saldos.efArs, resultado: res },
              EUR: { app: saldos.efEur, resultado: res },
            },
            banco: {
              USD: { esp: fmtEsp(espBaUsdPorPaso[i]), app: saldos.baUsd, resultado: res },
              ARS: { app: saldos.baArs, resultado: res },
            },
            nroTransaccionInterno: numerosTransaccionUsdUsd[i] || '',
            expSdoCE: expCEUsdUsd,
            realSdoCE: saldos.efArsNum,
            saldoCE_Rdo,
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { esp: fmtEsp(espEfUsdPorPaso[i]), app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { esp: fmtEsp(espBaUsdPorPaso[i]), app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
            nroTransaccionInterno: numerosTransaccionUsdUsd[i] || '',
            expSdoCE: expCEUsdUsd,
            realSdoCE: '',
            saldoCE_Rdo: 'ERR',
          });
        }

        if (i < 1) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
        }
      }

      logStep('5', 'Verificación final CC', 'Con las 2 transacciones ejecutadas el saldo CC cliente es 0.', 'Vista CC carga', 'OK');

      let controlCajaOk = false;
      let controlCajaError = '';
      let montosEfectivo = 'No capturado';
      let montosBanco = 'No capturado';
      let efUsd = '–', efArs = '–', efEur = '–', baUsd = '–', baArs = '–';
      let efArsNum = 0;
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        efArsNum = saldos.efArsNum ?? 0;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resUsdUsd = controlCajaOk ? 'OK' : 'err';
      const expCEFinalUsdUsd = 0;
      const saldoCE_RdoUsdUsd = controlCajaOk && Math.abs(efArsNum - expCEFinalUsdUsd) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: {
          USD: { esp: fmtEsp(espEfUsdPorPaso[1]), app: efUsd, resultado: resUsdUsd },
          ARS: { app: efArs, resultado: resUsdUsd },
          EUR: { app: efEur, resultado: resUsdUsd },
        },
        banco: {
          USD: { esp: fmtEsp(espBaUsdPorPaso[1]), app: baUsd, resultado: resUsdUsd },
          ARS: { app: baArs, resultado: resUsdUsd },
        },
        expSdoCE: expCEFinalUsdUsd,
        realSdoCE: controlCajaOk ? efArsNum : '',
        saldoCE_Rdo: saldoCE_RdoUsdUsd,
      });
      logStep('6.1', 'Control caja Efectivo', 'Saldos Efectivo visibles (USD, ARS, EUR).', 'Montos leídos de #cajas-saldo-efectivo-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosEfectivo : controlCajaError);
      logStep('6.2', 'Control caja Banco', 'Saldos Banco visibles (USD, ARS).', 'Montos leídos de #cajas-saldo-banco-*', controlCajaOk ? 'OK' : 'Fallo', controlCajaOk ? montosBanco : controlCajaError);
      if (!controlCajaOk) throw new Error(controlCajaError);
    } catch (err) {
      logStep('Error', 'Test falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});

test.describe('Orden USD-USD con intermediario, tasas duales y CC', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      // eslint-disable-next-line no-console
      console.warn('[E2E USD-USD+int] SKIP: definí TEST_USER_EMAIL y TEST_USER_PASSWORD en .env.test');
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden USD-USD con intermediario: 2 tx, CC cliente y comisión en CC intermediario', async ({ page }) => {
    test.setTimeout(180000);
    initLog('USD-USD-Int');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login', 'App lista', 'sidebar visible', 'OK');
      await asegurarClienteReservaPlaywright91(page);

      const optUsdUsdInt = page.locator('#orden-tipo-operacion option[data-codigo="USD-USD"][data-usa-intermediario="true"]');

      const nombreIntermediario = `E2E Int USDUSD ${Date.now().toString(36)}`;
      await page.locator('#menu-intermediarios').click();
      await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
      const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
      if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
        // eslint-disable-next-line no-console
        console.warn('[E2E USD-USD+int] SKIP: falta #btn-nuevo-intermediario (permiso abm_intermediarios).');
        test.skip(true, 'Se necesita permiso abm_intermediarios y botón Nuevo intermediario.');
      }
      await btnNuevoInt.click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#intermediario-nombre').fill(nombreIntermediario);
      await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      // El <select> #orden-tipo-operacion solo se puebla al abrir el modal (fetch en openModalOrden); antes solo existe "Elegir…".
      await expect(optUsdUsdInt.first()).toBeAttached({ timeout: 20000 });

      const valueUsdUsdInt = await optUsdUsdInt.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdUsdInt || '');
      await expect(page.locator('#orden-wrap-intermediario')).toBeVisible({ timeout: 5000 });

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        // eslint-disable-next-line no-console
        console.warn('[E2E USD-USD+int] SKIP: hace falta al menos 1 cliente además de "Sin asignar" (options count < 2).');
        test.skip(true, 'Se necesita al menos un cliente en la base de prueba.');
      }
      const indexCliente = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexCliente });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';
      await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#orden-wrap-int-patron-instrumentacion')).toBeVisible({ timeout: 5000 });
      await page.locator('input[name="orden-int-patron-radio"][value="cp_ic"]').check();
      await expect(page.locator('#orden-wrap-detalles-tras-patron')).toBeVisible({ timeout: 5000 });

      // Montos: recibir 5000, entregar 4700 (tasa cliente 3% + tasa intermediario 3%); comisión 300; 150 Pandy / 150 int (sobre importe).
      await page.locator('#orden-importe-cheque').fill('5000');
      await page.locator('#orden-tasa-descuento-cliente').fill('3');
      await page.locator('#orden-tasa-descuento-intermediario').fill('3');
      await page.waitForTimeout(400);
      const montoRecibidoStr = (await page.locator('#orden-monto-recibido').inputValue()) || '';
      const montoEntregadoStr = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const mrNum = parseFloat(String(montoRecibidoStr).replace(/\./g, '').replace(',', '.')) || 0;
      const meNum = parseFloat(String(montoEntregadoStr).replace(/\./g, '').replace(',', '.')) || 0;
      expect(Math.abs(mrNum - 5000) < 1 && Math.abs(meNum - 4700) < 1, `Esperado mr≈5000 me≈4700; obtenido mr=${mrNum} me=${meNum}`).toBe(true);

      const comisionInterEsperada = Math.round(mrNum * 0.03);

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(2, { timeout: 20000 });

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      const tbodyCc = page.locator('#cc-resumen-tbody');

      for (let i = 0; i < 2; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(combosEstado.nth(i)).toHaveValue('ejecutada', { timeout: 5000 });
        await esperarActualizacionEstadoOrden(page);
        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });
        if (i < 1) await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
      }

      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });

      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 2, 25000);
      const filaCli = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countCli = await filaCli.count();
      const celdaUsd = filaCli.first().locator('td:nth-child(2)');
      const saldoCli = countCli > 0 ? await leerSaldoConSigno(celdaUsd) : '–';
      const esCeroCli = countCli === 0 || saldoCli === '–' || normalizarMontoSaldo(saldoCli) === 0;
      expect(esCeroCli, `Tras 2 transacciones ejecutadas, CC cliente USD debe ser 0 (obtenido: ${saldoCli})`).toBe(true);

      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
      const filaInt = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="intermediario"]') }).filter({ hasText: nombreIntermediario });
      await expect(filaInt.first()).toBeVisible({ timeout: 12000 });
      const celdaIntUsd = filaInt.first().locator('td:nth-child(2)');
      const saldoIntTxt = await leerSaldoConSigno(celdaIntUsd);
      const saldoIntNum = normalizarMontoSaldo(saldoIntTxt);
      const deudaIntEsperada = meNum + comisionInterEsperada;
      expect(
        Math.abs(Math.abs(saldoIntNum) - deudaIntEsperada) <= 2,
        `CC intermediario USD debe reflejar me + comisión intermediario (~${deudaIntEsperada}); capturado: ${saldoIntTxt} (${saldoIntNum})`
      ).toBe(true);

      logStep('OK', 'USD-USD+int', 'CC cliente 0; CC int ≈ me + comisión int', 'resumen', 'OK');
    } catch (err) {
      logStep('Error', 'Test falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});

// --- Tests de reversa: regla infalible en CC y Caja ---
test.describe('Reversa (ejecutada → pendiente): CC y Caja deben volver al estado correcto', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('USD-USD: ejecutar ambas transacciones, reversar la 2.ª y la 1.ª; CC y Caja se restablecen', async ({ page }) => {
    test.setTimeout(180000);
    initLog('Reversa-USD-USD');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      await asegurarClienteReservaPlaywright91(page);
      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

      const optUsdUsdRev = page.locator('#orden-tipo-operacion option[data-codigo="USD-USD"][data-usa-intermediario="false"]');
      await expect(optUsdUsdRev).toHaveCount(1, { timeout: 5000 });
      const valueUsdUsd = await optUsdUsdRev.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdUsd);
      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) test.skip(true, 'Se necesita al menos un cliente en la base de prueba.');
      await page.locator('#orden-cliente').selectOption({ index: randomInt(1, countClientes - 1) });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      const importeUsd = randomInt(3000, 6000);
      await page.locator('#orden-importe-cheque').fill(String(importeUsd));
      await page.locator('#orden-tasa-descuento-cliente').fill(randomTasa(1, 2));
      await page.waitForTimeout(500);

      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || '';
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const mrNum = parseFloat(String(montoRecibido).replace(/\./g, '').replace(',', '.')) || 0;
      const meNum = parseFloat(String(montoEntregado).replace(/\./g, '').replace(',', '.')) || 0;

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(2, { timeout: 20000 });

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      const tbodyCc = page.locator('#cc-resumen-tbody');

      // Ejecutar las dos transacciones
      for (let i = 0; i < 2; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(combosEstado.nth(i)).toHaveValue('ejecutada', { timeout: 5000 });
        await esperarActualizacionEstadoOrden(page);
        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });
        if (i < 1) await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
      }

      // Estado: ambas ejecutadas. CC cliente debe ser 0; capturar caja
      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      let filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 2, 20000);
      filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countDespuesAmbas = await filaCliente.count();
      expect(countDespuesAmbas === 0 || normalizarMontoSaldo(await (countDespuesAmbas > 0 ? leerSaldoConSigno(filaCliente.first().locator('td:nth-child(2)')) : '–')) === 0,
        'Tras ejecutar ambas, CC cliente debe ser 0').toBe(true);
      logStep('R1', 'Ambas ejecutadas', 'CC cliente 0', 'OK', '');

      const cajaDespuesAmbas = await irACajasYLeerSaldos(page);
      expect(cajaDespuesAmbas.ok, 'Caja debe cargar').toBe(true);
      const efUsdAmbas = normalizarMontoSaldo(cajaDespuesAmbas.efUsd || '–');
      const expCE = 0; // USD-USD no mueve ARS
      const saldoCE_RdoAmbas = Math.abs((cajaDespuesAmbas.efArsNum ?? 0) - expCE) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: { USD: { app: cajaDespuesAmbas.efUsd, resultado: 'OK' }, ARS: { app: cajaDespuesAmbas.efArs, resultado: 'OK' }, EUR: { app: cajaDespuesAmbas.efEur, resultado: 'OK' } },
        banco: { USD: { app: cajaDespuesAmbas.baUsd, resultado: 'OK' }, ARS: { app: cajaDespuesAmbas.baArs, resultado: 'OK' } },
        expSdoCE: expCE,
        realSdoCE: cajaDespuesAmbas.efArsNum,
        saldoCE_Rdo: saldoCE_RdoAmbas,
      });
      logStep('R2', 'Caja tras ambas', 'Efectivo USD capturado', 'OK', '', cajaDespuesAmbas.efUsd);

      // Reversar la 2.ª transacción (egreso Pandy→Cliente)
      await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
      await reversarTransaccionEnWizard(page, combosEstado, 1);

      // CC debe volver a mostrar saldo del cliente (Pandy debe entregar)
      await page.locator('#orden-btn-cerrar-wizard').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });
      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countTrasReversar2 = await filaCliente.count();
      expect(countTrasReversar2 > 0, 'Tras reversar tr2 debe haber fila del cliente en CC (saldo distinto de 0)').toBe(true);
      const saldoTrasReversar2 = countTrasReversar2 > 0 ? await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(2)')) : '–';
      expect(normalizarMontoSaldo(saldoTrasReversar2) !== 0, 'Tras reversar tr2 el saldo CC cliente no debe ser 0').toBe(true);
      logStep('R3', 'Reversa tr2', 'CC cliente con saldo de nuevo', 'OK', '', saldoTrasReversar2);

      // Caja: el egreso revertido debe hacer que efectivo USD sea mayor que tras ambas
      const cajaTrasReversar2 = await irACajasYLeerSaldos(page);
      expect(cajaTrasReversar2.ok, 'Caja debe cargar').toBe(true);
      const efUsdTrasReversar2 = normalizarMontoSaldo(cajaTrasReversar2.efUsd || '–');
      expect(efUsdTrasReversar2 >= efUsdAmbas - 1, 'Tras reversar egreso, efectivo USD debe ser >= que tras ambas (se revirtió el egreso)').toBe(true);
      const saldoCE_RdoTras2 = Math.abs((cajaTrasReversar2.efArsNum ?? 0) - expCE) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: { USD: { app: cajaTrasReversar2.efUsd, resultado: 'OK' }, ARS: { app: cajaTrasReversar2.efArs, resultado: 'OK' }, EUR: { app: cajaTrasReversar2.efEur, resultado: 'OK' } },
        banco: { USD: { app: cajaTrasReversar2.baUsd, resultado: 'OK' }, ARS: { app: cajaTrasReversar2.baArs, resultado: 'OK' } },
        expSdoCE: expCE,
        realSdoCE: cajaTrasReversar2.efArsNum,
        saldoCE_Rdo: saldoCE_RdoTras2,
      });
      logStep('R4', 'Caja tras reversar tr2', 'Efectivo USD >= anterior', 'OK', '', cajaTrasReversar2.efUsd);

      // Reversar la 1.ª transacción (ingreso Cliente→Pandy)
      await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
      await reversarTransaccionEnWizard(page, combosEstado, 0);

      // CC debe volver a 0 o sin fila cliente
      await page.locator('#orden-btn-cerrar-wizard').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });
      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 2, 20000);
      filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
      const countTrasReversar1 = await filaCliente.count();
      const saldoFinal = countTrasReversar1 > 0 ? await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(2)')) : '–';
      expect(countTrasReversar1 === 0 || normalizarMontoSaldo(saldoFinal) === 0,
        `Tras reversar ambas, CC cliente debe ser 0. Saldo: ${saldoFinal}, filas: ${countTrasReversar1}`).toBe(true);
      logStep('R5', 'Reversa tr1', 'CC cliente en 0 de nuevo', 'OK', '', countTrasReversar1 === 0 ? '0 (sin fila)' : saldoFinal);

      // Caja: efectivo USD debe ser menor que tras reversar solo tr2 (se revirtió el ingreso)
      const cajaFinal = await irACajasYLeerSaldos(page);
      expect(cajaFinal.ok, 'Caja debe cargar').toBe(true);
      const efUsdFinal = normalizarMontoSaldo(cajaFinal.efUsd || '–');
      expect(efUsdFinal <= efUsdTrasReversar2 + 1, 'Tras reversar ingreso, efectivo USD debe ser <= que tras solo reversar tr2').toBe(true);
      const saldoCE_RdoFinal = Math.abs((cajaFinal.efArsNum ?? 0) - expCE) <= 1 ? 'PASS' : 'ERR';
      logCajaControl({
        efectivo: { USD: { app: cajaFinal.efUsd, resultado: 'OK' }, ARS: { app: cajaFinal.efArs, resultado: 'OK' }, EUR: { app: cajaFinal.efEur, resultado: 'OK' } },
        banco: { USD: { app: cajaFinal.baUsd, resultado: 'OK' }, ARS: { app: cajaFinal.baArs, resultado: 'OK' } },
        expSdoCE: expCE,
        realSdoCE: cajaFinal.efArsNum,
        saldoCE_Rdo: saldoCE_RdoFinal,
      });
      logStep('R6', 'Caja tras reversar tr1', 'Efectivo USD coherente', 'OK', '', cajaFinal.efUsd);
    } catch (err) {
      logStep('Error', 'Test reversa falló', '-', '-', 'Fallo', (err && (err.message || err.toString())) || 'Error desconocido');
      throw err;
    } finally {
      const outPath = writeLogToExcel();
      console.log('Log E2E escrito en:', outPath);
    }
  });
});
