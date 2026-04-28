// @ts-check
/**
 * E2E focal: CHEQUE-ARS + intermediario, **tasa cliente 0%** y **tasa intermediario 2,5%**, 4× ejecutada —
 * la CC cliente debe mostrar «Comisión del acuerdo» (+mr−me) y **seguir** tras sync global (`#cc-btn-refrescar`),
 * regresión del bug persistido solo cobro+compromiso.
 *
 * Requiere: `.env.test` con TEST_USER_EMAIL, TEST_USER_PASSWORD, SUPABASE_* (mismo dev que global-setup).
 * @see tests/e2e/91-orden-cc.spec.js (flujo base idéntico en pasos 0–3).
 */
const { test, expect } = require('@playwright/test');
const { initLog, setNroOrdenInterno, logStep, writeLogToExcel } = require('./e2e-log-excel');
const { limpiarBaseE2eDesdeTests } = require('./e2e-limpiar-base');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

const CLIENTE_E2E = 'E2E CHEQUE Comisión Invariante';

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

async function esperarActualizacionEstadoOrden(page, timeoutMs = 35000) {
  const msg = page.locator('#orden-inst-actualizando-msg');
  await msg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await msg.waitFor({ state: 'hidden', timeout: timeoutMs });
}

/**
 * CHEQUE-ARS (wizard instrumentación): si `multicontraparte_manual` quedó activo, «Listo» no cierra
 * (totales MC vs acuerdo). `force` por si el wrap tarda en medir visible en Playwright.
 */
async function asegurarMulticontraparteManualApagadaWizardInst(page) {
  const chk = page.locator('#orden-inst-multicontraparte-manual');
  await chk.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  if ((await chk.count()) === 0) return;
  const checked = await chk.isChecked().catch(() => false);
  if (!checked) return;
  await chk.setChecked(false, { force: true });
  await esperarActualizacionEstadoOrden(page).catch(() => {});
  await expect(chk).not.toBeChecked({ timeout: 25000 });
  await page.waitForTimeout(500);
}

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

/** Igual que 91-orden-cc: lee celda CC con clases valor-positivo / valor-negativo. */
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
  const t = String(s).replace(/^[\s+\-\u2212]+/, '').replace(/\u2212/g, '-').trim();
  if (!t) return 0;
  const normalizado = t.replace(/\./g, '').replace(',', '.');
  const n = Number(normalizado);
  return isNaN(n) ? 0 : n;
}

function saldoLeidoANumero(saldoStr) {
  if (saldoStr === '–' || saldoStr === '' || saldoStr == null) return 0;
  const neg = /^-|−/.test(String(saldoStr));
  const abs = normalizarMontoSaldo(saldoStr);
  return neg ? -abs : abs;
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

function filaIntermediarioPorNombre(tbodyCc, page, nombreIntermediario) {
  const reInt = new RegExp(String(nombreIntermediario || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return tbodyCc
    .locator('tr')
    .filter({ has: page.locator('button[data-tipo="intermediario"]') })
    .filter({ hasText: reInt });
}

/**
 * Igual que 91: con saldo 0 el resumen CC **no** lista al cliente (solo mensaje vacío).
 * @param columnaMoneda índice 1-based de `td` en la fila resumen: 2=USD, 3=ARS, 4=EUR (orden `MONEDAS_CC_UI` en main.js).
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

/**
 * Tras sync global CC: vuelve a Movimientos, filtra por cliente y comprueba fila «Comisión del acuerdo» y monto ≈ esperado.
 */
async function assertComisionAcuerdoVisibleMovimientos(page, nombreCliente, spreadEsperado, etiqueta) {
  await page.locator('#cc-tab-movimientos').click();
  await expect(page.locator('#cc-panel-movimientos')).toBeVisible({ timeout: 5000 });
  await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
  await page.locator('#cc-btn-refrescar-movimientos').click();
  await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
  await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 90000 });
  await page.waitForTimeout(800);
  await page.locator('#cc-detalle-entidad-select').selectOption({ label: nombreCliente }).catch(async () => {});

  const filaComision = page.locator('#cc-vista-detalle-tbody tr').filter({ hasText: /Comisión del acuerdo/i });
  await expect(filaComision.first(), `Comisión del acuerdo visible (${etiqueta})`).toBeVisible({ timeout: 20000 });
  const celdaArs = filaComision.first().locator('td').nth(6);
  const texto = await leerSaldoConSigno(celdaArs);
  const leido = saldoLeidoANumero(texto);
  expect(
    Math.abs(leido - spreadEsperado),
    `Monto comisión (${etiqueta}): esperado ${spreadEsperado}, leído ${texto} → ${leido}`,
  ).toBeLessThanOrEqual(1);
}

/** CHEQUE-ARS cerrado: CC intermediario debe cerrar en 0 (sin fila en resumen o celda ARS en 0). */
async function esperarCcIntermediarioSaldoCeroArs(page, tbodyCc, nombreIntermediario, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.locator('#cc-btn-refrescar').click();
    await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
    await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
    await page.waitForTimeout(1500);
    const fila = filaIntermediarioPorNombre(tbodyCc, page, nombreIntermediario);
    const count = await fila.count();
    if (count === 0) return true;
    const celda = fila.first().locator('td:nth-child(3)');
    const saldo = await leerSaldoConSigno(celda);
    if (normalizarMontoSaldo(saldo) === 0 || saldo === '–') return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

/** Movimientos CC con filtro intermediario: fila «Comisión del acuerdo» con monto ARS ≈ −spread (p. ej. −5000 en libro). */
async function assertComisionAcuerdoVisibleMovimientosIntermediario(page, nombreIntermediario, spreadEsperado, etiqueta) {
  await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
  await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('#cc-tab-movimientos').click();
  await expect(page.locator('#cc-panel-movimientos')).toBeVisible({ timeout: 5000 });
  await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
  await page.locator('#cc-btn-refrescar-movimientos').click();
  await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
  await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 90000 });
  await page.waitForTimeout(800);
  await page.locator('#cc-detalle-entidad-select').selectOption({ label: nombreIntermediario }).catch(async () => {});

  const filaComision = page.locator('#cc-vista-detalle-tbody tr').filter({ hasText: /Comisión del acuerdo/i });
  await expect(filaComision.first(), `Comisión del acuerdo visible CC intermediario (${etiqueta})`).toBeVisible({
    timeout: 20000,
  });
  const celdaArs = filaComision.first().locator('td').nth(6);
  const texto = await leerSaldoConSigno(celdaArs);
  const leido = saldoLeidoANumero(texto);
  const esperadoNeg = -spreadEsperado;
  expect(
    Math.abs(leido - esperadoNeg),
    `Monto comisión intermediario (${etiqueta}): esperado ${esperadoNeg}, leído ${texto} → ${leido}`,
  ).toBeLessThanOrEqual(1);
  expect(leido, `Comisión intermediario debe figurar en negativo (${etiqueta})`).toBeLessThan(0);
}

test.describe('CHEQUE-ARS comisión acuerdo CC (invariante + sync global)', () => {
  test.beforeEach(async () => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('4× ejecutada: comisión del acuerdo en Movimientos y persiste tras Refrescar CC', async ({ page }) => {
    test.setTimeout(200000);
    initLog('CHEQUE-ARS-comision-invariante');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      logStep('0', 'Login', 'App lista', 'expect sidebar', 'OK');

      const nombreCliente = CLIENTE_E2E;
      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      for (let i = 0; i < 15; i++) {
        const fila = page.locator('#ordenes-tbody tr').filter({ hasText: nombreCliente }).first();
        const btnAnular = fila.locator('.btn-anular-orden-tabla');
        if ((await btnAnular.count()) === 0 || !(await btnAnular.isVisible())) break;
        await btnAnular.click();
        await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: /anular orden/i }).click();
        await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(1200);
      }

      await page.locator('#menu-clientes').click();
      await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
      if ((await page.locator('#clientes-tbody tr').filter({ hasText: nombreCliente }).count()) === 0) {
        const btnNuevo = page.locator('#btn-nuevo-cliente');
        if ((await btnNuevo.count()) === 0 || !(await btnNuevo.isVisible())) {
          test.skip(true, 'Se necesita permiso abm_clientes.');
        }
        await btnNuevo.click();
        await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
        await page.locator('#cliente-nombre').fill(nombreCliente);
        await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
        await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(400);
      }

      const nombreIntermediario = 'E2E Int Comisión ' + Date.now();
      await page.locator('#menu-intermediarios').click();
      await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
      const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
      if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
        test.skip(true, 'Se necesita permiso abm_intermediarios.');
      }
      await btnNuevoInt.click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#intermediario-nombre').fill(nombreIntermediario);
      await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(400);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

      const optCheque = page.locator('#orden-tipo-operacion option[data-codigo="CHEQUE-ARS"][data-usa-intermediario="true"]');
      await expect(optCheque).toHaveCount(1, { timeout: 5000 });
      await page.locator('#orden-tipo-operacion').selectOption(await optCheque.getAttribute('value'));
      await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
      await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });
      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });

      await page.locator('#orden-importe-cheque').fill('200000');
      await page.locator('#orden-tasa-descuento-cliente').fill('0');
      await page.waitForTimeout(400);
      await page.locator('#orden-tasa-descuento-intermediario').fill('2,5');
      await page.waitForTimeout(300);

      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || '200000';
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const mrNum = parseFloat(String(montoRecibido).replace(/\./g, '').replace(',', '.')) || 200000;
      const meNum = parseFloat(String(montoEntregado).replace(/\./g, '').replace(',', '.')) || 195000;
      const spreadEsperado = Math.round(mrNum - meNum);

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      let combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(4);

      const tituloOrden = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNro = tituloOrden.match(/#(\d+)/);
      if (matchNro) setNroOrdenInterno(matchNro[1]);

      for (let i = 0; i < 4; i++) {
        const valorActual = await combosEstado.nth(i).inputValue();
        if (valorActual !== 'ejecutada') {
          await combosEstado.nth(i).selectOption('ejecutada');
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
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 90000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 90000 });
      await page.waitForTimeout(1200);

      const tbodyCc = page.locator('#cc-resumen-tbody');
      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(600);
      // CHEQUE-ARS cerrado: saldo cliente ARS = 0 → el resumen **no** lista la fila (solo «sin saldo distinto de cero»).
      const okSaldoCeroArs = await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 3, 60000);
      expect(
        okSaldoCeroArs,
        'CC cliente ARS debe netear 0 (sin fila o celda ARS en 0) tras 4 ejecutadas',
      ).toBe(true);

      await assertComisionAcuerdoVisibleMovimientos(page, nombreCliente, spreadEsperado, 'tras primera carga CC');

      logStep('1', 'Sync global CC', 'Refrescar todas las órdenes', 'click #cc-btn-refrescar', 'OK');
      await page.locator('#cc-tab-saldos').click();
      await expect(page.locator('#cc-panel-saldos')).toBeVisible({ timeout: 5000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 120000 });
      await page.waitForTimeout(1500);

      await assertComisionAcuerdoVisibleMovimientos(page, nombreCliente, spreadEsperado, 'tras Refrescar CC (sync global)');

      logStep('2', 'Comisión', 'Visible y estable', `spread ≈ ${spreadEsperado}`, 'OK');
    } finally {
      writeLogToExcel();
    }
  });

  test('legacy: tasa cliente 2,5 % e intermediario 0 — 4× ejecutada (E,E,E,E) y CC', async ({ page }) => {
    test.setTimeout(200000);
    initLog('CHEQUE-ARS-tasas-empresa-int-cero');
    try {
      limpiarBaseE2eDesdeTests();
      await loginAndSeeApp(page);
      const nombreCliente = 'E2E CHEQUE Tasas Emp Int0';
      await page.locator('#menu-clientes').click();
      await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
      if ((await page.locator('#clientes-tbody tr').filter({ hasText: nombreCliente }).count()) === 0) {
        const btnNuevo = page.locator('#btn-nuevo-cliente');
        if ((await btnNuevo.count()) === 0 || !(await btnNuevo.isVisible())) {
          test.skip(true, 'Se necesita permiso abm_clientes.');
        }
        await btnNuevo.click();
        await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
        await page.locator('#cliente-nombre').fill(nombreCliente);
        await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
        await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(400);
      }
      const nombreIntermediario = 'E2E Int Tasas0 ' + Date.now();
      await page.locator('#menu-intermediarios').click();
      await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
      const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
      if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
        test.skip(true, 'Se necesita permiso abm_intermediarios.');
      }
      await btnNuevoInt.click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
      await page.locator('#intermediario-nombre').fill(nombreIntermediario);
      await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
      await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(400);

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      const optCheque = page.locator('#orden-tipo-operacion option[data-codigo="CHEQUE-ARS"][data-usa-intermediario="true"]');
      await expect(optCheque).toHaveCount(1, { timeout: 5000 });
      await page.locator('#orden-tipo-operacion').selectOption(await optCheque.getAttribute('value'));
      await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
      await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });
      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });

      await page.locator('#orden-importe-cheque').fill('200000');
      await page.locator('#orden-tasa-descuento-cliente').fill('2,5');
      await page.waitForTimeout(400);
      await page.locator('#orden-tasa-descuento-intermediario').fill('0');
      await page.waitForTimeout(500);

      await expect(page.locator('#orden-wrap-montos-calculados')).toBeVisible({ timeout: 15000 });
      const mrVal = normalizarMontoSaldo((await page.locator('#orden-monto-recibido').inputValue()) || '');
      const meVal = normalizarMontoSaldo((await page.locator('#orden-monto-entregado').inputValue()) || '');
      expect(mrVal).toBe(200000);
      expect(Math.round(mrVal - meVal)).toBe(5000);

      await page.locator('#orden-btn-ir-instrumentacion').click();
      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      let combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(4, { timeout: 30000 });
      await asegurarMulticontraparteManualApagadaWizardInst(page);

      const tituloOrden = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNro = tituloOrden.match(/#(\d+)/);
      if (matchNro) setNroOrdenInterno(matchNro[1]);

      for (let i = 0; i < 4; i++) {
        await asegurarMulticontraparteManualApagadaWizardInst(page);
        const valorActual = await combosEstado.nth(i).inputValue();
        if (valorActual !== 'ejecutada') {
          await combosEstado.nth(i).selectOption('ejecutada');
          await esperarActualizacionEstadoOrden(page);
        }
        await asegurarMulticontraparteManualApagadaWizardInst(page);
        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 45000 });
        if (i < 3) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
          combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
          await expect(combosEstado).toHaveCount(4);
        }
      }

      const spreadEsperado = 5000;
      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 90000 });
      const tbodyCc = page.locator('#cc-resumen-tbody');

      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(600);
      const okCliente = await esperarCcClienteSaldoCero(page, tbodyCc, nombreCliente, 3, 60000);
      expect(okCliente, 'CC cliente ARS debe netear 0 tras 4 ejecutadas (legacy)').toBe(true);

      await page.locator('#cc-tab-saldos').click();
      await expect(page.locator('#cc-panel-saldos')).toBeVisible({ timeout: 5000 });
      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(600);
      const okIntCero = await esperarCcIntermediarioSaldoCeroArs(page, tbodyCc, nombreIntermediario, 60000);
      expect(
        okIntCero,
        'CC intermediario ARS debe cerrar en 0 (orden cerrada; en Movimientos la comisión figura como −spread, sin saldo residual)',
      ).toBe(true);

      await assertComisionAcuerdoVisibleMovimientosIntermediario(
        page,
        nombreIntermediario,
        spreadEsperado,
        'legacy CC int movimientos',
      );

      await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
      await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(400);
      await assertComisionAcuerdoVisibleMovimientos(page, nombreCliente, spreadEsperado, 'legacy tras 4E');
    } finally {
      writeLogToExcel();
    }
  });
});
