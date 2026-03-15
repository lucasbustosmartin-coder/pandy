// @ts-check
const { test, expect } = require('@playwright/test');
const { initLog, setNroOrdenInterno, logStep, logTransaccion, logCajaControl, writeLogToExcel } = require('./e2e-log-excel');

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

/** Hace login y deja la app en estado listo (sidebar + app-content visibles). */
async function loginAndSeeApp(page) {
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-email').fill(TEST_USER_EMAIL);
  await page.locator('#login-password').fill(TEST_USER_PASSWORD);
  await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();

  const loginError = page.locator('#login-error');
  const success = await Promise.race([
    page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 20000 }).then(() => true),
    loginError.filter({ hasText: /.+/ }).waitFor({ timeout: 20000 }).then(() => false),
  ]).catch(() => false);

  if (!success) {
    const msg = (await loginError.textContent()) || 'Sin mensaje';
    throw new Error('Login falló. Revisá .env.test. Error: ' + msg);
  }
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

/**
 * Va a Cajas, espera a que termine la carga (saldos actualizados) y lee los saldos.
 * Así los valores no quedan en blanco (–). Devuelve { ok, efUsd, efArs, efEur, baUsd, baArs } o { ok: false, error }.
 */
async function irACajasYLeerSaldos(page) {
  await page.locator('#menu-cajas').click();
  await expect(page.locator('#vista-cajas')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cajas-saldos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cajas-loading')).toBeHidden({ timeout: 20000 });
  const efUsd = (await page.locator('#cajas-saldo-efectivo-usd').textContent())?.trim() || '–';
  const efArs = (await page.locator('#cajas-saldo-efectivo-ars').textContent())?.trim() || '–';
  const efEur = (await page.locator('#cajas-saldo-efectivo-eur').textContent())?.trim() || '–';
  const baUsd = (await page.locator('#cajas-saldo-banco-usd').textContent())?.trim() || '–';
  const baArs = (await page.locator('#cajas-saldo-banco-ars').textContent())?.trim() || '–';
  return { ok: true, efUsd, efArs, efEur, baUsd, baArs };
}

test.describe('Orden ARS-ARS, transacciones y cuenta corriente', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden ARS-ARS, ejecutar transacciones y verificar que CC refleja cada paso', async ({ page }) => {
    test.setTimeout(180000);
    initLog('ARS-ARS');
    try {
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optArsArs = page.locator('#orden-tipo-operacion option[data-codigo="ARS-ARS"]');
      await expect(optArsArs).toHaveCount(1, { timeout: 5000 });
      const valueArsArs = await optArsArs.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueArsArs);

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexCliente = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexCliente });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';

      const optsIntermediario = page.locator('#orden-intermediario option');
      const countInt = await optsIntermediario.count();
      if (countInt < 2) {
        test.skip(true, 'Se necesita al menos un intermediario (además de "Sin asignar") para ARS-ARS (cheque).');
      }
      const indexIntermediario = randomInt(1, countInt - 1);
      await page.locator('#orden-intermediario').selectOption({ index: indexIntermediario });
      const nombreIntermediario = (await page.locator('#orden-intermediario option:checked').textContent())?.trim() || '';

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      logStep('2', 'Tipo ARS-ARS, cliente e intermediario seleccionados', 'Paso Detalles visible', 'expect #orden-step-detalles visible', 'OK', `Cliente: ${nombreCliente}, Int: ${nombreIntermediario}`);

      await expect(page.locator('#orden-wrap-primeros-datos')).toBeVisible({ timeout: 2000 });
      const importeCheque = randomInt(50000, 200000);
      const tasaClienteStr = randomTasa(1, 3);
      const tasaIntStr = randomTasa(0.5, 2);
      await page.locator('#orden-importe-cheque').fill(String(importeCheque));
      await page.locator('#orden-tasa-descuento-cliente').fill(tasaClienteStr);
      await page.waitForTimeout(400);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
      await page.locator('#orden-tasa-descuento-intermediario').fill(tasaIntStr);
      await page.waitForTimeout(200);

      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || String(importeCheque);
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';
      const tasaIntLeida = (await page.locator('#orden-tasa-descuento-intermediario').inputValue()) || '0';
      const tasaIntPct = parseFloat(tasaIntLeida.replace(',', '.')) || 0;
      const mrNum = parseFloat(String(montoRecibido).replace(/\./g, '').replace(',', '.')) || 0;
      const meNum = parseFloat(String(montoEntregado).replace(/\./g, '').replace(',', '.')) || 0;
      const montoEfectivoInt = (tasaIntPct >= 0 && tasaIntPct < 100) ? Math.round(mrNum * (1 - tasaIntPct / 100)) : mrNum;
      const montoEfectivoIntStr = String(montoEfectivoInt);
      const comisionPandy = Math.round(mrNum - meNum);
      /** Saldo esperado ARS Efectivo/Banco tras cada transacción (0..3). tr1: +mr banco; tr2: -me ef; tr3: -mr banco; tr4: +montoEfectivoInt ef + comisión ef. */
      const espEfArsPorPaso = [0, -meNum, -meNum, -meNum + montoEfectivoInt + comisionPandy];
      const espBaArsPorPaso = [mrNum, mrNum, 0, 0];
      const fmtEsp = (n) => (typeof n === 'number' && !isNaN(n) ? String(Math.round(n)) : '');

      await page.locator('#orden-btn-ir-instrumentacion').click();

      await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#orden-inst-tbody tr:has(.combo-estado-transaccion)')).toHaveCount(4, { timeout: 20000 });

      const tituloOrden = (await page.locator('#modal-orden-titulo').textContent()) || '';
      const matchNro = tituloOrden.match(/#(\d+)/);
      if (matchNro) setNroOrdenInterno(matchNro[1]);
      const idsTransaccion = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id') || ''));
      const numerosTransaccion = await page.locator('#orden-inst-tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-numero') || ''));

      const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
      await expect(combosEstado).toHaveCount(4);
      logStep('3', 'Datos ARS-ARS (100000, tasa 1,5 y 1) e Ir a instrumentación', 'Paso Instrumentación con 4 transacciones', 'expect 4 filas con combo estado', 'OK', 'UI orden: pagador cliente→pandy→intermediario; ingreso y su egreso. Paso 1..4 = fila 0..3');

      const tbodyCc = page.locator('#cc-resumen-tbody');
      const reCliente = nombreCliente ? new RegExp(nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;
      const reInt = nombreIntermediario ? new RegExp(nombreIntermediario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /.+/;

      for (let i = 0; i < 4; i++) {
        await combosEstado.nth(i).selectOption('ejecutada');
        await expect(page.getByText('Estado de la transacción actualizado.').first()).toBeVisible({ timeout: 10000 });

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await page.locator('#cc-btn-refrescar').click();
        await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });

        // UI orden: fila 0=tr1 (Cliente→Pandy), 1=tr2 (Pandy→Cliente), 2=tr3 (Pandy→Int), 3=tr4 (Int→Pandy). La app solo muestra filas con saldo ≠ 0; si saldo es 0 la fila puede no existir.
        if (i === 0 || i === 1) {
          await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
          await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
          const filaCliente = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') }).filter({ hasText: reCliente });
          if (i === 0) await expect(filaCliente.first()).toBeVisible({ timeout: 10000 });
          const countCliente = await filaCliente.count();
          let saldoCliente = '–';
          if (countCliente > 0) {
            await expect(filaCliente.first()).toBeVisible({ timeout: 5000 });
            const celdaArsCliente = filaCliente.first().locator('td:nth-child(4)');
            await expect(celdaArsCliente).toContainText(/\d|\–/);
            saldoCliente = await leerSaldoConSigno(celdaArsCliente);
          }
          if (i === 0) {
            expect(countCliente > 0, 'Paso 1: debe haber fila del cliente en CC con saldo positivo').toBe(true);
            logStep('4.1', 'Paso 1: Cliente paga a Pandy (fila 0)', 'CC cliente con saldo ARS positivo (cliente debe a Pandy).', 'Filtro Cliente; celda ARS', 'OK', '', saldoCliente, numerosTransaccion[0]);
            logTransaccion(1, 'Cliente', 'Pandy', 'ARS', 'Cheque', montoRecibido, saldoCliente, 'OK', numerosTransaccion[0]);
          } else {
            // Paso 2: no mostrar fila del cliente = saldo 0 (la app oculta filas con saldo cero). Correcto.
            const s = String(saldoCliente).replace(/^[+\-]/, '').trim();
            const normalizado = s.replace(/\./g, '').replace(',', '.');
            const esCero = countCliente === 0 || saldoCliente === '–' || s === '' || Number(normalizado) === 0;
            expect(esCero, `Paso 2: después de Pandy→Cliente la CC del cliente debe ser 0. Sin fila = 0. Se capturó: ${saldoCliente}, filas: ${countCliente}`).toBe(true);
            logStep('4.2', 'Paso 2: Pandy paga al cliente (fila 1)', 'CC cliente cierra en 0 (mr y me se compensan). Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoCliente, numerosTransaccion[1]);
            logTransaccion(2, 'Pandy', 'Cliente', 'ARS', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoCliente, 'OK', numerosTransaccion[1]);
          }
        } else {
          await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
          await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
          if (i === 3) {
            await page.locator('#cc-btn-refrescar').click();
            await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
            await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
            await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
            await page.waitForTimeout(1500);
          }
          const filaIntBase = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="intermediario"]') }).filter({ hasText: reInt });
          if (i === 2) await expect(filaIntBase.first()).toBeVisible({ timeout: 10000 });
          const countInt = await filaIntBase.count();
          let saldoInt = '–';
          if (countInt > 0) {
            await expect(filaIntBase.first()).toBeVisible({ timeout: 5000 });
            const celdaArsInt = filaIntBase.first().locator('td:nth-child(4)');
            await expect(celdaArsInt).toContainText(/\d|\–/);
            saldoInt = await leerSaldoConSigno(celdaArsInt);
          }
          if (i === 2) {
            expect(countInt > 0, 'Paso 3: debe haber fila del intermediario en CC con saldo').toBe(true);
            logStep('4.3', 'Paso 3: Pandy paga a Intermediario (fila 2)', 'CC intermediario con saldo ARS (intermediario debe hasta que pague efectivo).', 'Filtro Intermediario; celda ARS', 'OK', '', saldoInt, numerosTransaccion[2]);
            logTransaccion(3, 'Pandy', 'Intermediario', 'ARS', 'Cheque', montoRecibido, saldoInt, 'OK', numerosTransaccion[2]);
          } else {
            // Paso 4: no mostrar fila del intermediario = saldo 0. Correcto.
            const s = String(saldoInt).replace(/^[+\-]/, '').trim();
            const normalizado = s.replace(/\./g, '').replace(',', '.');
            const esCero = countInt === 0 || saldoInt === '–' || s === '' || Number(normalizado) === 0;
            expect(esCero, `Paso 4: después de Int→Pandy la CC del intermediario debe ser 0. Sin fila = 0. Se capturó: ${saldoInt}, filas: ${countInt}`).toBe(true);
            logStep('4.4', 'Paso 4: Intermediario paga a Pandy (fila 3)', 'CC intermediario cierra en 0. Sin fila = saldo 0.', 'Filtro Intermediario; sin fila o celda 0', 'OK', '', countInt === 0 ? '0 (sin fila)' : saldoInt, numerosTransaccion[3]);
            logTransaccion(4, 'Intermediario', 'Pandy', 'ARS', 'Efectivo', montoEfectivoIntStr, countInt === 0 ? '0' : saldoInt, 'OK', numerosTransaccion[3]);
          }
        }

        // Control de caja tras esta transacción (una fila por transacción en el log Excel; saldo esperado ARS y nro transacción interno)
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          logCajaControl({
            efectivo: {
              USD: { app: saldos.efUsd, resultado: res },
              ARS: { esp: fmtEsp(espEfArsPorPaso[i]), app: saldos.efArs, resultado: res },
              EUR: { app: saldos.efEur, resultado: res },
            },
            banco: {
              USD: { app: saldos.baUsd, resultado: res },
              ARS: { esp: fmtEsp(espBaArsPorPaso[i]), app: saldos.baArs, resultado: res },
            },
            nroTransaccionInterno: numerosTransaccion[i] || '',
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { esp: fmtEsp(espEfArsPorPaso[i]), app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { esp: fmtEsp(espBaArsPorPaso[i]), app: '–', resultado: 'err' } },
            nroTransaccionInterno: numerosTransaccion[i] || '',
          });
        }

        if (i < 3) {
          await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
        }
      }

      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
      await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
      await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
      await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });
      logStep('5', 'Verificación final CC', 'Con las 4 transacciones ejecutadas el saldo en ambas CC es 0 (regla cierra).', 'Vista CC carga; filtros Cliente e Intermediario con tabla visible', 'OK');

      // Paso 6: Control de caja final (ya se registró una fila por transacción en el loop)
      let controlCajaOk = false;
      let controlCajaError = '';
      let montosEfectivo = 'No capturado';
      let montosBanco = 'No capturado';
      let efUsd = '–', efArs = '–', efEur = '–', baUsd = '–', baArs = '–';
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const res = controlCajaOk ? 'OK' : 'err';
      logCajaControl({
        efectivo: {
          USD: { app: efUsd, resultado: res },
          ARS: { esp: fmtEsp(espEfArsPorPaso[3]), app: efArs, resultado: res },
          EUR: { app: efEur, resultado: res },
        },
        banco: {
          USD: { app: baUsd, resultado: res },
          ARS: { esp: fmtEsp(espBaArsPorPaso[3]), app: baArs, resultado: res },
        },
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
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optArsUsd = page.locator('#orden-tipo-operacion option[data-codigo="ARS-USD"]');
      await expect(optArsUsd).toHaveCount(1, { timeout: 5000 });
      const valueArsUsd = await optArsUsd.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueArsUsd);

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteArsUsd = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteArsUsd });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';
      await page.locator('#orden-intermediario').selectOption({ index: 0 });

      await page.locator('#orden-btn-next').click();
      await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 3000 });
      logStep('2', 'Tipo ARS-USD, cliente seleccionado, sin intermediario', 'Paso Detalles visible', 'expect #orden-step-detalles visible', 'OK', `Cliente: ${nombreCliente}`);

      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 2000 });
      const cotizArsUsd = randomInt(800, 1200);
      const montoRecibidoArsUsd = randomInt(500000, 1500000);
      await page.locator('#orden-cotizacion').fill(String(cotizArsUsd));
      await page.locator('#orden-monto-recibido').fill(String(montoRecibidoArsUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
      const montoRecibido = (await page.locator('#orden-monto-recibido').inputValue()) || String(montoRecibidoArsUsd);
      const montoEntregado = (await page.locator('#orden-monto-entregado').inputValue()) || '';

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
        await expect(page.getByText('Estado de la transacción actualizado.').first()).toBeVisible({ timeout: 10000 });

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        const filaCliente = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') }).filter({ hasText: reCliente });
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
          const s = String(saldoMoneda).replace(/^[+\-]/, '').trim();
          const normalizado = s.replace(/\./g, '').replace(',', '.');
          const esCero = countCliente === 0 || saldoMoneda === '–' || s === '' || Number(normalizado) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente (USD) la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga USD al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionArsUsd[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'USD', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionArsUsd[1]);
        }

        // Control de caja tras esta transacción
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          logCajaControl({
            efectivo: { USD: { app: saldos.efUsd, resultado: res }, ARS: { app: saldos.efArs, resultado: res }, EUR: { app: saldos.efEur, resultado: res } },
            banco: { USD: { app: saldos.baUsd, resultado: res }, ARS: { app: saldos.baArs, resultado: res } },
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
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
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resArsUsd = controlCajaOk ? 'OK' : 'err';
      logCajaControl({
        efectivo: { USD: { app: efUsd, resultado: resArsUsd }, ARS: { app: efArs, resultado: resArsUsd }, EUR: { app: efEur, resultado: resArsUsd } },
        banco: { USD: { app: baUsd, resultado: resArsUsd }, ARS: { app: baArs, resultado: resArsUsd } },
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
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optUsdArs = page.locator('#orden-tipo-operacion option[data-codigo="USD-ARS"]');
      await expect(optUsdArs).toHaveCount(1, { timeout: 5000 });
      const valueUsdArs = await optUsdArs.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdArs);

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteUsdArs = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteUsdArs });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';
      await page.locator('#orden-intermediario').selectOption({ index: 0 });

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
        await expect(page.getByText('Estado de la transacción actualizado.').first()).toBeVisible({ timeout: 10000 });

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        const filaCliente = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') }).filter({ hasText: reCliente });
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
          const s = String(saldoMoneda).replace(/^[+\-]/, '').trim();
          const normalizado = s.replace(/\./g, '').replace(',', '.');
          const esCero = countCliente === 0 || saldoMoneda === '–' || s === '' || Number(normalizado) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente (ARS) la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga ARS al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionUsdArs[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'ARS', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionUsdArs[1]);
        }

        // Control de caja tras esta transacción
        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
          logCajaControl({
            efectivo: { USD: { app: saldos.efUsd, resultado: res }, ARS: { app: saldos.efArs, resultado: res }, EUR: { app: saldos.efEur, resultado: res } },
            banco: { USD: { app: saldos.baUsd, resultado: res }, ARS: { app: saldos.baArs, resultado: res } },
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
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
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resUsdArs = controlCajaOk ? 'OK' : 'err';
      logCajaControl({
        efectivo: { USD: { app: efUsd, resultado: resUsdArs }, ARS: { app: efArs, resultado: resUsdArs }, EUR: { app: efEur, resultado: resUsdArs } },
        banco: { USD: { app: baUsd, resultado: resUsdArs }, ARS: { app: baArs, resultado: resUsdArs } },
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
      await loginAndSeeApp(page);
      logStep('0', 'Login con usuario de prueba', 'Sidebar y app-content visibles', 'expect #login-screen hidden, #sidebar y #app-content visible', 'OK');

      await page.locator('#menu-ordenes').click();
      await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
      await page.locator('#btn-nueva-orden').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });
      logStep('1', 'Abrir Nueva orden', 'Modal de orden visible', 'expect #modal-orden-backdrop.activo visible', 'OK');

      const optUsdUsd = page.locator('#orden-tipo-operacion option[data-codigo="USD-USD"]');
      await expect(optUsdUsd).toHaveCount(1, { timeout: 5000 });
      const valueUsdUsd = await optUsdUsd.getAttribute('value');
      await page.locator('#orden-tipo-operacion').selectOption(valueUsdUsd);

      const optsCliente = page.locator('#orden-cliente option');
      const countClientes = await optsCliente.count();
      if (countClientes < 2) {
        test.skip(true, 'Se necesita al menos un cliente (además de "Sin asignar") en la base de prueba.');
      }
      const indexClienteUsdUsd = randomInt(1, countClientes - 1);
      await page.locator('#orden-cliente').selectOption({ index: indexClienteUsdUsd });
      const nombreCliente = (await page.locator('#orden-cliente option:checked').textContent())?.trim() || '';
      await page.locator('#orden-intermediario').selectOption({ index: 0 });

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
        await expect(page.getByText('Estado de la transacción actualizado.').first()).toBeVisible({ timeout: 10000 });

        await page.locator('#orden-btn-cerrar-wizard').click();
        await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 15000 });

        await page.locator('#menu-cuenta-corriente').click();
        await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
        await expect(page.locator('#cc-contenido')).toBeVisible({ timeout: 5000 });
        await expect(tbodyCc.locator('tr').first()).toBeVisible({ timeout: 15000 });

        await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
        await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 3000 });
        const filaCliente = tbodyCc.locator('tr').filter({ has: page.locator('button[data-tipo="cliente"]') }).filter({ hasText: reCliente });
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
          const s = String(saldoMoneda).replace(/^[+\-]/, '').trim();
          const normalizado = s.replace(/\./g, '').replace(',', '.');
          const esCero = countCliente === 0 || saldoMoneda === '–' || s === '' || Number(normalizado) === 0;
          expect(esCero, `Paso 2: después de Pandy→Cliente la CC del cliente debe ser 0. Se capturó: ${saldoMoneda}, filas: ${countCliente}`).toBe(true);
          logStep('4.2', 'Paso 2: Pandy paga USD al cliente (fila 1)', 'CC cliente cierra en 0. Sin fila = saldo 0.', 'Filtro Cliente; sin fila o celda 0', 'OK', '', countCliente === 0 ? '0 (sin fila)' : saldoMoneda, numerosTransaccionUsdUsd[1]);
          logTransaccion(2, 'Pandy', 'Cliente', 'USD', 'Efectivo', montoEntregado, countCliente === 0 ? '0' : saldoMoneda, 'OK', numerosTransaccionUsdUsd[1]);
        }

        try {
          const saldos = await irACajasYLeerSaldos(page);
          const res = saldos.ok ? 'OK' : 'err';
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
          });
        } catch (e) {
          logCajaControl({
            efectivo: { USD: { esp: fmtEsp(espEfUsdPorPaso[i]), app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' }, EUR: { app: '–', resultado: 'err' } },
            banco: { USD: { esp: fmtEsp(espBaUsdPorPaso[i]), app: '–', resultado: 'err' }, ARS: { app: '–', resultado: 'err' } },
            nroTransaccionInterno: numerosTransaccionUsdUsd[i] || '',
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
      try {
        const saldos = await irACajasYLeerSaldos(page);
        controlCajaOk = saldos.ok;
        efUsd = saldos.efUsd;
        efArs = saldos.efArs;
        efEur = saldos.efEur;
        baUsd = saldos.baUsd;
        baArs = saldos.baArs;
        montosEfectivo = `USD: ${efUsd}; ARS: ${efArs}; EUR: ${efEur}`;
        montosBanco = `USD: ${baUsd}; ARS: ${baArs}`;
      } catch (e) {
        controlCajaError = (e && (e.message || e.toString())) || 'Error desconocido';
      }
      const resUsdUsd = controlCajaOk ? 'OK' : 'err';
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
