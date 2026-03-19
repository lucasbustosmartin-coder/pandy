// @ts-check
/**
 * E2E: combinaciones Tx1/Tx2 (P/E) para tipos de operación **sin intermediario** con 2 transacciones:
 * ARS-USD, USD-ARS, USD-USD.
 *
 * CHEQUE-ARS (4 tx + intermediario) no está aquí: usar `tests/e2e/cc-combinaciones.spec.js`.
 * Suite completa activos: `npm run test:e2e-cc-activos-completo` (CHEQUE + este archivo).
 *
 * Expectativas enteras: `cc-tipos-activos-esperado.js`. Log numérico en Excel (importes como number).
 *
 * Filtros (opcional):
 *   TIPO_CODIGO=ARS-USD COMBINACION_ID="E,P" npx playwright test tests/e2e/cc-tipos-activos-combinaciones.spec.js --headed
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const XLSX = require('xlsx');
const { test, expect } = require('@playwright/test');
const {
  ARS_USD_FIJOS,
  USD_ARS_FIJOS,
  USD_USD_FIJOS,
  COMBINACIONES_ARS_USD,
  COMBINACIONES_USD_ARS,
  COMBINACIONES_USD_USD,
} = require('./cc-tipos-activos-esperado');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

const CLIENTE_TIPOS_2TX = 'E2E CC TiposActivos';

const LOG_HEADERS = [
  'Tipo',
  'Combinación',
  'Exp USD',
  'Real USD',
  'Rdo USD',
  'Exp ARS',
  'Real ARS',
  'Rdo ARS',
  'Exp Detalle',
  'Real Detalle',
  'Rdo Detalle',
  'Exp Caja USD',
  'Real Caja USD',
  'Rdo Caja USD',
  'Exp Caja ARS',
  'Real Caja ARS',
  'Rdo Caja ARS',
];

function escribirLogExcel(logRows) {
  if (!logRows || logRows.length < 2) return;
  const dir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(logRows);
  XLSX.utils.book_append_sheet(wb, ws, 'CC Tipos 2tx');
  XLSX.writeFile(wb, path.join(dir, 'cc-tipos-activos-log.xlsx'));
}

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
  const t = String(s).replace(/^[\s+\-\u2212]+/, '').replace(/\u2212/g, '-').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(t);
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

/** Lee efectivo USD (#cajas-saldo-efectivo-usd) con signo desde clase .negativo */
async function leerSaldoCajaEfectivoUSD(page) {
  await page.locator('#menu-cajas').click();
  await expect(page.locator('#vista-cajas')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cajas-saldos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cajas-loading')).toBeHidden({ timeout: 20000 });
  const el = page.locator('#cajas-saldo-efectivo-usd');
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

async function leerSaldoCajaEfectivoARS(page) {
  const el = page.locator('#cajas-saldo-efectivo-ars');
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return 0;
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

async function leerCajasUsdArs(page) {
  const usd = await leerSaldoCajaEfectivoUSD(page);
  const ars = await leerSaldoCajaEfectivoARS(page);
  return { usd, ars };
}

/**
 * Montos del modal Ver detalle: una moneda por fila (cols USD=6, ARS=7, EUR=8).
 */
async function leerMontosModalDetalleCliente(page) {
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#modal-cc-detalle-loading')).toBeHidden({ timeout: 15000 });
  await page.waitForSelector('#cc-detalle-tbody tr:nth-of-type(1)', { timeout: 10000 });
  const filas = page.locator('#cc-detalle-tbody tr');
  const n = await filas.count();
  const montos = [];
  for (let f = 0; f < n; f++) {
    for (const col of [6, 7, 8]) {
      const texto = await leerSaldoConSigno(filas.nth(f).locator(`td:nth-child(${col})`));
      if (texto !== '–' && /\d/.test(texto)) montos.push(saldoLeidoANumero(texto));
    }
  }
  await page.locator('#modal-cc-detalle-close').click();
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
  return [...montos].sort((a, b) => a - b);
}

/** Fallback: vista Detalle de movimientos (misma pantalla CC). */
async function leerMontosDesdeVistaDetalle(page, nombreCliente) {
  const nombre = (nombreCliente || '').trim();
  if (!nombre) return [];
  try {
    await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
    await page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo').waitFor({ state: 'visible', timeout: 2000 });
    await page.waitForTimeout(400);
    await page.locator('#cc-vista-toggle button[data-vista="detalle"]').click();
    await page.locator('#cc-detalle-wrap').waitFor({ state: 'visible', timeout: 5000 });
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
      for (const col of [6, 7, 8]) {
        const texto = await leerSaldoConSigno(row.locator(`td:nth-child(${col})`));
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

const TIPOS_SUITE = [
  {
    codigo: 'ARS-USD',
    combinaciones: COMBINACIONES_ARS_USD,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(ARS_USD_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(ARS_USD_FIJOS.montoRecibidoArs);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'USD-ARS',
    combinaciones: COMBINACIONES_USD_ARS,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(USD_ARS_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(USD_ARS_FIJOS.montoRecibidoUsd);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'USD-USD',
    combinaciones: COMBINACIONES_USD_USD,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-wrap-primeros-datos')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-importe-cheque').fill(USD_USD_FIJOS.importe);
      await page.locator('#orden-tasa-descuento-cliente').fill(USD_USD_FIJOS.tasaCliente);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
];

test.describe('CC tipos 2 transacciones: combinaciones P/E Tx1 Tx2', () => {
  test.beforeEach(async () => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('ARS-USD, USD-ARS, USD-USD — datos fijos y validación por combinación', async ({ page }) => {
    test.setTimeout(900000);

    const filtroTipo = (process.env.TIPO_CODIGO || '').trim();
    const filtroComb = (process.env.COMBINACION_ID || '').trim();

    await loginAndSeeApp(page);

    if (filtroTipo && !TIPOS_SUITE.some((t) => t.codigo === filtroTipo)) {
      test.skip(true, `TIPO_CODIGO inválido o no cubierto por este spec: ${filtroTipo}`);
    }

    const nombreCliente = CLIENTE_TIPOS_2TX;
    const tbodyCc = page.locator('#cc-resumen-tbody');
    const logRows = [LOG_HEADERS];
    const rootDir = path.resolve(__dirname, '../..');
    const STEP_TIMEOUT_MS = 180000;
    let ranAny = false;

    try {
      for (const cfg of TIPOS_SUITE) {
        if (filtroTipo && cfg.codigo !== filtroTipo) continue;

        for (const esperado of cfg.combinaciones) {
          if (filtroComb && esperado.id !== filtroComb) continue;

          console.log(`>>> ${cfg.codigo} combinación ${esperado.id}`);
          ranAny = true;

          await test.step(`${cfg.codigo} ${esperado.id}`, async () => {
            const stepTimeout = new Promise((_, reject) => {
              setTimeout(
                () => reject(new Error(`${cfg.codigo} ${esperado.id}: timeout ${STEP_TIMEOUT_MS / 1000}s`)),
                STEP_TIMEOUT_MS
              );
            });

            await Promise.race([
              (async () => {
                try {
                  execSync('node scripts/limpiar-base-e2e.js', {
                    cwd: rootDir,
                    stdio: 'inherit',
                    env: { ...process.env, NODE_ENV: 'test' },
                  });
                } catch (e) {
                  if (e.status !== 0) console.warn(`  [${cfg.codigo} ${esperado.id}] limpiar-base-e2e falló; continuando.`);
                }
                await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
                await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

                await page.locator('#menu-clientes').click();
                await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
                const btnNuevo = page.locator('#btn-nuevo-cliente');
                if ((await btnNuevo.count()) === 0 || !(await btnNuevo.isVisible())) {
                  test.skip(true, 'Se necesita permiso abm_clientes y botón Nuevo cliente.');
                }
                await btnNuevo.click();
                await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
                await page.locator('#cliente-nombre').fill(nombreCliente);
                await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
                await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
                await page.waitForTimeout(400);

                await page.locator('#menu-ordenes').click();
                await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
                await page.locator('#btn-nueva-orden').click();
                await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

                const opt = page.locator(`#orden-tipo-operacion option[data-codigo="${cfg.codigo}"]`);
                await expect(opt).toHaveCount(1, { timeout: 5000 });
                const valueTipo = await opt.getAttribute('value');
                await page.locator('#orden-tipo-operacion').selectOption(valueTipo);
                await page.locator('#orden-wrap-intermediario').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

                await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
                await page.locator('#orden-btn-next').click();
                await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });

                await cfg.fillDetalles(page);

                await page.locator('#orden-btn-ir-instrumentacion').click();
                await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
                const combosEstado = page.locator('#orden-inst-tbody .combo-estado-transaccion');
                await expect(combosEstado).toHaveCount(2, { timeout: 20000 });

                const estados = [esperado.tx1, esperado.tx2];
                for (let i = 0; i < 2; i++) {
                  if (estados[i] !== 'E') continue;
                  const actual = await combosEstado.nth(i).inputValue();
                  if (actual !== 'ejecutada') {
                    await combosEstado.nth(i).selectOption('ejecutada');
                    await esperarActualizacionEstadoOrden(page);
                  }
                }

                await page.locator('#orden-btn-cerrar-wizard').click();
                await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });

                await page.locator('#menu-cuenta-corriente').click();
                await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 10000 });
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
                await page.locator('#cc-btn-refrescar').click();
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 }).catch(() => {});
                await page.waitForTimeout(1200);

                await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
                await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
                await page.waitForTimeout(500);

                const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
                const countCli = await filaCliente.count();
                let saldoUSD = 0;
                let saldoARS = 0;
                if (countCli > 0) {
                  const tUsd = await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(2)'));
                  const tArs = await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(4)'));
                  saldoUSD = saldoLeidoANumero(tUsd);
                  saldoARS = saldoLeidoANumero(tArs);
                }

                const expU = Number(esperado.saldoUSD) || 0;
                const expA = Number(esperado.saldoARS) || 0;
                const diffU = countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expA) <= 1 ? 0 : Math.abs(saldoUSD - expU);
                const diffA = countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expA) <= 1 ? 0 : Math.abs(saldoARS - expA);
                if (countCli === 0 && (Math.abs(expU) > 1 || Math.abs(expA) > 1)) {
                  throw new Error(`${cfg.codigo} ${esperado.id}: sin fila cliente pero se esperaba saldo USD=${expU} ARS=${expA}`);
                }

                const esperadoSorted = [...(esperado.detalleCliente || [])].sort((a, b) => a - b);
                let appSorted = [];

                if (countCli > 0) {
                  await filaCliente.first().locator('.btn-ver-detalle').click();
                  appSorted = await leerMontosModalDetalleCliente(page);
                } else if (esperadoSorted.length > 0) {
                  const leido = await leerMontosDesdeVistaDetalle(page, nombreCliente);
                  if (leido.length > 0) appSorted = leido;
                }

                let resDet = 'ERR';
                if (esperadoSorted.length === 0) resDet = 'PASS';
                else if (appSorted.length === esperadoSorted.length && esperadoSorted.every((v, i) => Math.abs((appSorted[i] || 0) - v) <= 1))
                  resDet = 'PASS';

                let realCajaUsd;
                let realCajaArs;
                {
                  const first = await leerCajasUsdArs(page);
                  realCajaUsd = first.usd;
                  realCajaArs = first.ars;
                }
                const expCajaU = Number(esperado.cajaUSD) || 0;
                const expCajaA = Number(esperado.cajaARS) || 0;
                if (expCajaU !== 0 && realCajaUsd === 0) {
                  await page.waitForTimeout(3000);
                  const again = await leerCajasUsdArs(page);
                  realCajaUsd = again.usd;
                  realCajaArs = again.ars;
                }
                const diffCajaU = Math.abs(realCajaUsd - expCajaU);
                const diffCajaA = Math.abs(realCajaArs - expCajaA);

                const rdoU = diffU <= 1 ? 'PASS' : 'ERR';
                const rdoA = diffA <= 1 ? 'PASS' : 'ERR';
                const rdoCajaU = diffCajaU <= 1 ? 'PASS' : 'ERR';
                const rdoCajaA = diffCajaA <= 1 ? 'PASS' : 'ERR';

                logRows.push([
                  cfg.codigo,
                  esperado.id,
                  expU,
                  saldoUSD,
                  rdoU,
                  expA,
                  saldoARS,
                  rdoA,
                  JSON.stringify(esperadoSorted),
                  JSON.stringify(appSorted),
                  resDet,
                  expCajaU,
                  realCajaUsd,
                  rdoCajaU,
                  expCajaA,
                  realCajaArs,
                  rdoCajaA,
                ]);

                expect(diffU, `${cfg.codigo} ${esperado.id}: saldo USD esp ${expU} app ${saldoUSD}`).toBeLessThanOrEqual(1);
                expect(diffA, `${cfg.codigo} ${esperado.id}: saldo ARS esp ${expA} app ${saldoARS}`).toBeLessThanOrEqual(1);
                if (esperadoSorted.length > 0) {
                  expect(appSorted.length, `${cfg.codigo} ${esperado.id}: detalle cantidad esp ${esperadoSorted.length} app ${appSorted.length}`).toBe(
                    esperadoSorted.length
                  );
                  for (let i = 0; i < esperadoSorted.length; i++) {
                    expect(Math.abs((appSorted[i] || 0) - esperadoSorted[i]), `${cfg.codigo} ${esperado.id}: detalle[${i}]`).toBeLessThanOrEqual(1);
                  }
                }
                expect(diffCajaU, `${cfg.codigo} ${esperado.id}: caja USD esp ${expCajaU} app ${realCajaUsd}`).toBeLessThanOrEqual(1);
                expect(diffCajaA, `${cfg.codigo} ${esperado.id}: caja ARS esp ${expCajaA} app ${realCajaArs}`).toBeLessThanOrEqual(1);
              })(),
              stepTimeout,
            ]);
          });
        }
      }
      if (!ranAny) {
        throw new Error('No se ejecutó ninguna combinación. Revisá TIPO_CODIGO y COMBINACION_ID.');
      }
    } finally {
      escribirLogExcel(logRows);
    }
  });
});
