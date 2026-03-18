// @ts-check
/**
 * Tests E2E: todas las combinaciones de estados (Tx1,Tx2,Tx3,Tx4) para ARS-ARS con intermediario.
 * Mismos datos fijos (200k, 195k, 197k, 5k, 3k). Valida saldo y detalle CC cliente e intermediario.
 * Escribe un log en Excel (test-results/cc-combinaciones-log.xlsx) con expectativa, real y resultado (PASS/ERR) por combinación.
 *
 * Convención arranque limpio: se usa un cliente fijo (CLIENTE_CC_COMBINACIONES). Al inicio se anulan
 * todas las órdenes de ese cliente para que el detalle CC sea solo de la orden que crea este test.
 * Expectativas = tabla de reglas (cc-combinaciones-esperado.js); ante fallo: explicar qué falló y calibrar
 * (no cambiar el esperado para "hacer pasar" el test).
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { test, expect } = require('@playwright/test');
const { COMBINACIONES_ESPERADO, DATOS_FIJOS } = require('./cc-combinaciones-esperado');

const LOG_HEADERS = [
  'Combinación',
  'Expect Saldo CC Cliente', 'Real Saldo CC Cliente', 'Resultado Saldo Cliente',
  'Expect Saldo CC Int', 'Real Saldo CC Int', 'Resultado Saldo Int',
  'Expect Detalle Cliente', 'Real Detalle Cliente', 'Resultado Detalle Cliente',
  'Expect Detalle Int', 'Real Detalle Int', 'Resultado Detalle Int',
];

function escribirLogExcel(logRows) {
  if (!logRows || logRows.length < 2) return;
  const dir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(logRows);
  XLSX.utils.book_append_sheet(wb, ws, 'CC Combinaciones');
  const outPath = path.join(dir, 'cc-combinaciones-log.xlsx');
  XLSX.writeFile(wb, outPath);
}

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

/** Cliente fijo para este test. Arranque limpio: al inicio se anulan todas sus órdenes. */
const CLIENTE_CC_COMBINACIONES = 'E2E CC Combinaciones';

async function esperarActualizacionEstadoOrden(page, timeoutMs = 90000) {
  const msg = page.locator('#orden-inst-actualizando-msg');
  await msg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await msg.waitFor({ state: 'hidden', timeout: timeoutMs });
}

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
  return esIntermediario ? -n : n;
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

test.describe('CC ARS-ARS: combinaciones de estados Tx1..Tx4', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('crear orden con datos fijos y validar saldo/detalle en cada combinación', async ({ page }) => {
    test.setTimeout(420000); // 7 min para 12 combinaciones (excl. Tx1=P y Tx3=E; P,P,E,P; P,E,E,E)

    await loginAndSeeApp(page);

    // Arranque limpio: anular todas las órdenes del cliente fijo para que el detalle CC sea solo de esta ejecución
    const nombreCliente = CLIENTE_CC_COMBINACIONES;
    await page.locator('#menu-ordenes').click();
    await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#ordenes-tbody')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 15; i++) {
      const fila = page.locator('#ordenes-tbody tr').filter({ hasText: nombreCliente }).first();
      const btnAnular = fila.locator('.btn-anular-orden-tabla');
      if ((await btnAnular.count()) === 0 || !(await btnAnular.isVisible())) break;
      await btnAnular.click();
      await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 5000 });
      await page.getByRole('button', { name: /^anular$/i }).click();
      await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(1500);
    }

    // Asegurar que existe el cliente fijo (crear si no existe)
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

    // Intermediario único por run para no chocar con otras pruebas
    const nombreIntermediario = 'E2E Int ' + Date.now();
    await page.locator('#menu-intermediarios').click();
    await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
    const btnNuevoInt = page.locator('#btn-nuevo-intermediario');
    if ((await btnNuevoInt.count()) === 0 || !(await btnNuevoInt.isVisible())) {
      test.skip(true, 'Se necesita permiso abm_intermediarios y botón Nuevo intermediario para aislar una sola orden por run.');
    }
    await btnNuevoInt.click();
    await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
    await page.locator('#intermediario-nombre').fill(nombreIntermediario);
    await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
    await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Crear una sola orden ARS-ARS con datos fijos (200k, tasas para 195k y 197k)
    await page.locator('#menu-ordenes').click();
    await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
    await page.locator('#btn-nueva-orden').click();
    await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

    const valueArsArs = await page.locator('#orden-tipo-operacion option[data-codigo="ARS-ARS"]').getAttribute('value');
    await page.locator('#orden-tipo-operacion').selectOption(valueArsArs);

    // Opciones de un <select> pueden ser "hidden" hasta abrirlo; seleccionar por label sin exigir visible
    await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
    await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });

    await page.locator('#orden-btn-next').click();
    await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });

    // Datos fijos: 200000 → monto recibido; tasas para que me≈195000 y efectivo int≈197000
    await page.locator('#orden-importe-cheque').fill(String(DATOS_FIJOS.montoRecibido));
    await page.locator('#orden-tasa-descuento-cliente').fill('2,5');
    await page.waitForTimeout(500);
    await page.locator('#orden-tasa-descuento-intermediario').fill('1,5');
    await page.waitForTimeout(300);

    await page.locator('#orden-btn-ir-instrumentacion').click();
    await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
    let combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
    await expect(combosEstado).toHaveCount(4);

    const tbodyCc = page.locator('#cc-resumen-tbody');
    const reInt = new RegExp(nombreIntermediario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const logRows = [LOG_HEADERS];

    try {
    for (let idx = 0; idx < COMBINACIONES_ESPERADO.length; idx++) {
      const esperado = COMBINACIONES_ESPERADO[idx];
      const estados = [esperado.tx1, esperado.tx2, esperado.tx3, esperado.tx4];
      // Siempre tener el esperado de detalle (aunque no abramos el modal) para log y para no dar PASS falso
      const esperadoSorted = [...(esperado.detalleCliente || [])].sort((a, b) => a - b);
      const esperadoIntSorted = [...(esperado.detalleInt || [])].sort((a, b) => a - b);
      let appSorted = [];
      let appIntSorted = [];

      await test.step(`Combinación ${esperado.id}`, async () => {
      // Para combinaciones 1..n reabrir orden e ir a instrumentación (en la 0 ya estamos ahí)
      if (idx > 0) {
        await reopenOrderAndGoToInstrumentacion(page, nombreCliente);
        combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
        await expect(combosEstado).toHaveCount(4);
      }

      // Fijar cada combo en el estado esperado (E o P)
      for (let i = 0; i < 4; i++) {
        const valorActual = await combosEstado.nth(i).inputValue();
        const valorQuerido = estados[i] === 'E' ? 'ejecutada' : 'pendiente';
        if (valorActual === valorQuerido) continue;
        await combosEstado.nth(i).selectOption(valorQuerido === 'ejecutada' ? 'ejecutada' : 'pendiente');
        if (valorQuerido === 'pendiente') {
          await expect(page.locator('#modal-confirm-backdrop')).toBeVisible({ timeout: 10000 }).catch(() => {});
          await page.getByRole('button', { name: /sí, reversar/i }).click().catch(() => {});
          await expect(page.locator('#modal-confirm-backdrop')).toBeHidden({ timeout: 5000 }).catch(() => {});
        }
        await esperarActualizacionEstadoOrden(page);
      }

      await page.locator('#orden-btn-cerrar-wizard').click();
      await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });

      await page.locator('#menu-cuenta-corriente').click();
      await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
      await page.locator('#cc-btn-refrescar').click();
      await expect(page.locator('#cc-loading')).toBeVisible({ timeout: 3000 }).catch(() => {});
      await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 45000 });
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

      // Validar detalle Cliente: abrir "Ver detalle", leer montos ARS (resistente: esperar al menos 1 fila y leer las que haya)
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

      // Validar detalle Intermediario
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

      // Log a Excel: expectativa, real, resultado (PASS/ERR/N/A). N/A = no se pudo verificar (sin fila en resumen, ej. saldo 0).
      const resSaldoCli = diffCli <= 1 ? 'PASS' : 'ERR';
      const resSaldoInt = diffInt <= 1 ? 'PASS' : 'ERR';
      let resDetalleCli = 'ERR';
      if (esperadoSorted.length === 0) resDetalleCli = 'PASS';
      else if (countCli === 0) resDetalleCli = 'N/A'; // sin fila, no se pudo abrir modal
      else if (appSorted.length === esperadoSorted.length && esperadoSorted.every((v, i) => Math.abs((appSorted[i] || 0) - v) <= 1)) resDetalleCli = 'PASS';
      let resDetalleInt = 'ERR';
      if (esperadoIntSorted.length === 0) resDetalleInt = 'PASS';
      else if (countInt === 0) resDetalleInt = 'N/A';
      else if (appIntSorted.length === esperadoIntSorted.length && esperadoIntSorted.every((v, i) => Math.abs((appIntSorted[i] || 0) - v) <= 1)) resDetalleInt = 'PASS';
      logRows.push([
        esperado.id,
        esperado.saldoClienteARS, saldoClienteARS, resSaldoCli,
        esperado.saldoIntARS, saldoIntARS, resSaldoInt,
        JSON.stringify(esperado.detalleCliente || []), JSON.stringify(appSorted), resDetalleCli,
        JSON.stringify(esperado.detalleInt || []), JSON.stringify(appIntSorted), resDetalleInt,
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
      expect(diffInt, `Combinación ${esperado.id}: saldo CC intermediario esperado ${esperado.saldoIntARS}, app ${saldoIntARS}`).toBeLessThanOrEqual(1);
      if (countInt > 0 && esperado.detalleInt && esperado.detalleInt.length >= 0) {
        expect(appIntSorted.length, `Combinación ${esperado.id}: detalle intermediario: cantidad esperada ${esperadoIntSorted.length}, app ${appIntSorted.length}`).toBe(esperadoIntSorted.length);
        for (let i = 0; i < esperadoIntSorted.length; i++) {
          const diff = Math.abs((appIntSorted[i] || 0) - (esperadoIntSorted[i] || 0));
          expect(diff, `Combinación ${esperado.id}: detalle int monto ${i + 1} esperado ${esperadoIntSorted[i]}, app ${appIntSorted[i]}`).toBeLessThanOrEqual(1);
        }
      }
      }); // fin test.step Combinación
    }
    } finally {
      escribirLogExcel(logRows);
    }
  });
});
