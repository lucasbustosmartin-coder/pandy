// @ts-check
/**
 * E2E: USD-ARS, ARS-USD, USD-EUR, EUR-USD, EUR-ARS y ARS-EUR con intermediario (flujo inverso ci_pc). Corre **después** de
 * `01-cc-combinaciones` (CHEQUE-ARS) y `02-cc-tipos-activos` (tipos 2 tx sin int.).
 * Log: hoja **CC Inversa** en `test-results/cc-combinaciones-log.xlsx` (importes numéricos).
 *
 * Instrumentación: en Detalles se elige radio **ci_pc** (Cliente→Intermediario + Pandy→Cliente) para alinear el
 * autocompletado de 2 transacciones con los escenarios; ya no se cargan Tx1/Tx2 a mano.
 *
 * Con intermediario (motor `reglas_de_negocio`), p. ej.:
 *   `npm run test:e2e-cc-usd-ars-int-inversa` | `npm run test:e2e-cc-usd-eur-int-inversa` | `npm run test:e2e-cc-eur-ars-int-inversa` …
 *   o `TIPO_CODIGO=…` con este spec (ver `docs/e2e-comandos-por-tipo-y-combinacion.tsv`).
 *
 * Filtros opcionales: `TIPO_CODIGO` (`USD-ARS` | `ARS-USD`), `COMBINACION_ID` (`P,P` | `E,P` | `P,E` | `E,E`).
 */
const path = require('path');
const { execSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { reloadYEsperarAppLista } = require('./e2e-reload-app');
const { ccResumenDisplayMatchAlgebraico, ccResumenDisplayDiffAlgebraico } = require('./cc-resumen-optica-match');
const {
  USD_ARS_INT_FIJOS,
  ARS_USD_INT_FIJOS,
  USD_EUR_INT_FIJOS,
  EUR_USD_INT_FIJOS,
  EUR_ARS_INT_FIJOS,
  ARS_EUR_INT_FIJOS,
  COMBINACIONES_USD_ARS_INT_INVERSA,
  COMBINACIONES_ARS_USD_INT_INVERSA,
  COMBINACIONES_USD_EUR_INT_INVERSA,
  COMBINACIONES_EUR_USD_INT_INVERSA,
  COMBINACIONES_EUR_ARS_INT_INVERSA,
  COMBINACIONES_ARS_EUR_INT_INVERSA,
} = require('./cc-intermediario-inversa-esperado');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';
const CLIENTE_NOMBRE = 'E2E CC Int Inversa';

const { writeSuiteSheet } = require('./cc-combinaciones-log-workbook');

/** Log numérico (importes como number) en hoja **CC Inversa** de `cc-combinaciones-log.xlsx`. */
const LOG_HEADERS_INV = [
  'Tipo',
  'Combinación',
  'Exp Cli USD',
  'Real Cli USD',
  'Rdo Cli USD',
  'Exp Cli EUR',
  'Real Cli EUR',
  'Rdo Cli EUR',
  'Exp Cli ARS',
  'Real Cli ARS',
  'Rdo Cli ARS',
  'Exp Int USD',
  'Real Int USD',
  'Rdo Int USD',
  'Exp Int EUR',
  'Real Int EUR',
  'Rdo Int EUR',
  'Exp Int ARS',
  'Real Int ARS',
  'Rdo Int ARS',
  'Exp Det Cli',
  'Real Det Cli',
  'Rdo Det Cli',
  'Exp Det Int',
  'Real Det Int',
  'Rdo Det Int',
  'Exp Caja USD',
  'Real Caja USD',
  'Rdo Caja USD',
  'Exp Caja EUR',
  'Real Caja EUR',
  'Rdo Caja EUR',
  'Exp Caja ARS',
  'Real Caja ARS',
  'Rdo Caja ARS',
];

function escribirLogInversa(logRows) {
  writeSuiteSheet('CC Inversa', logRows);
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

async function loginAndSeeApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10000 });
  await page.locator('#login-email').fill(TEST_USER_EMAIL);
  await page.locator('#login-password').fill(TEST_USER_PASSWORD);
  await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();
  await expect(page.locator('#login-screen')).toBeHidden({ timeout: 20000 });
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 5000 });
}

async function esperarActualizacionEstadoOrden(page, timeoutMs = 90000) {
  const msg = page.locator('#orden-inst-actualizando-msg');
  await msg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await msg.waitFor({ state: 'hidden', timeout: timeoutMs });
}

async function crearCliente(page, nombreCliente) {
  await page.locator('#menu-clientes').click();
  await expect(page.locator('#vista-clientes')).toBeVisible({ timeout: 5000 });
  await page.locator('#btn-nuevo-cliente').click();
  await expect(page.locator('#modal-cliente-backdrop.activo')).toBeVisible({ timeout: 5000 });
  await page.locator('#cliente-nombre').fill(nombreCliente);
  await page.locator('#form-cliente').getByRole('button', { name: /guardar/i }).click();
  await expect(page.locator('#modal-cliente-backdrop.activo')).toBeHidden({ timeout: 10000 });
}

async function crearIntermediario(page, nombreIntermediario) {
  await page.locator('#menu-intermediarios').click();
  await expect(page.locator('#vista-intermediarios')).toBeVisible({ timeout: 5000 });
  await page.locator('#btn-nuevo-intermediario').click();
  await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeVisible({ timeout: 5000 });
  await page.locator('#intermediario-nombre').fill(nombreIntermediario);
  await page.locator('#form-intermediario').getByRole('button', { name: /guardar/i }).click();
  await expect(page.locator('#modal-intermediario-backdrop.activo')).toBeHidden({ timeout: 10000 });
}

async function crearOrdenConIntermediario(page, cfg, nombreCliente, nombreIntermediario) {
  await page.locator('#menu-ordenes').click();
  await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
  await page.locator('#btn-nueva-orden').click();
  await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

  const opt = page.locator(`#orden-tipo-operacion option[data-codigo="${cfg.codigo}"][data-usa-intermediario="true"]`);
  await expect(opt).toHaveCount(1, { timeout: 5000 });
  const tipoId = await opt.getAttribute('value');
  await page.locator('#orden-tipo-operacion').selectOption(tipoId);
  await page.locator('#orden-cliente').selectOption({ label: nombreCliente });
  await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });
  await page.locator('#orden-btn-next').click();
  await expect(page.locator('#orden-step-detalles')).toBeVisible({ timeout: 5000 });

  await cfg.fillDetalles(page);

  // La app autocompleta 2 transacciones al entrar a instrumentación (USD-ARS/ARS-USD+int).
  // Por defecto es cp_ic (C→Pandy + Int→Cliente); este E2E modela el flujo inverso ci_pc (C→Intermediario + Pandy→Cliente).
  if (
    cfg.codigo === 'USD-ARS' ||
    cfg.codigo === 'ARS-USD' ||
    cfg.codigo === 'USD-EUR' ||
    cfg.codigo === 'EUR-USD' ||
    cfg.codigo === 'EUR-ARS' ||
    cfg.codigo === 'ARS-EUR'
  ) {
    const rCi = page.locator('input[name="orden-int-patron-radio"][value="ci_pc"]');
    await expect(rCi).toBeVisible({ timeout: 8000 });
    await rCi.check();
  }

  await page.locator('#orden-btn-ir-instrumentacion').click();
  await expect(page.locator('#orden-step-instrumentacion')).toBeVisible({ timeout: 15000 });
}

async function setearEstadosTx(page, esperado) {
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
}

async function leerFilaResumen(page, tipo, nombre) {
  await page.locator(`#cc-filtro-tipo button[data-tipo="${tipo}"]`).click();
  await expect(page.locator(`#cc-filtro-tipo button[data-tipo="${tipo}"].activo`)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);
  const tbody = page.locator('#cc-resumen-tbody');
  const rows = tbody.locator('tr').filter({ has: page.locator(`button[data-tipo="${tipo}"]`) });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const n = (await row.locator('td').first().textContent())?.trim() || '';
    if (n === nombre) return row;
  }
  return null;
}

async function leerMontosModalDetalle(page) {
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#modal-cc-detalle-loading')).toBeHidden({ timeout: 15000 });
  await page.waitForSelector('#cc-detalle-tbody tr:nth-of-type(1)', { timeout: 10000 }).catch(() => {});
  const filas = page.locator('#cc-detalle-tbody tr');
  const n = await filas.count();
  const montos = [];
  for (let f = 0; f < n; f++) {
    const row = filas.nth(f);
    for (const mon of ['USD', 'ARS', 'EUR']) {
      const texto = await leerSaldoConSigno(row.locator(`td[data-cc-moneda-col="${mon}"]`));
      if (texto !== '–' && /\d/.test(texto)) montos.push(saldoLeidoANumero(texto));
    }
  }
  await page.locator('#modal-cc-detalle-close').click();
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
  return montos.sort((a, b) => a - b);
}

async function leerMontosDesdeVistaMovimientos(page, tipo, nombreEntidad) {
  const nombre = (nombreEntidad || '').trim();
  if (!nombre) return [];
  try {
    await page.locator(`#cc-filtro-tipo button[data-tipo="${tipo}"]`).click();
    await page.locator(`#cc-filtro-tipo button[data-tipo="${tipo}"].activo`).waitFor({ state: 'visible', timeout: 3000 });
    await page.waitForTimeout(300);
    await page.locator('#cc-vista-toggle button[data-vista="detalle"]').click();
    await page.locator('#cc-detalle-wrap').waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const tbody = page.locator('#cc-vista-detalle-tbody');
    await tbody.waitFor({ state: 'visible', timeout: 4000 });
    const filas = tbody.locator('tr');
    const n = await filas.count();
    const montos = [];
    for (let i = 0; i < n; i++) {
      const row = filas.nth(i);
      const entidadTxt = ((await row.locator('td:nth-child(10)').textContent()) || '').trim();
      if (!entidadTxt.includes(nombre)) continue;
      for (const col of [6, 7, 8]) {
        const texto = await leerSaldoConSigno(row.locator(`td:nth-child(${col})`));
        if (texto !== '–' && /\d/.test(texto)) {
          montos.push(saldoLeidoANumero(texto));
          break;
        }
      }
    }
    await page.locator('#cc-vista-toggle button[data-vista="resumen"]').click();
    await page.locator('#cc-contenido').waitFor({ state: 'visible', timeout: 4000 });
    await page.waitForTimeout(200);
    return montos.sort((a, b) => a - b);
  } catch (_) {
    try {
      await page.locator('#cc-vista-toggle button[data-vista="resumen"]').click().catch(() => {});
    } catch (_) {}
    return [];
  }
}

async function leerCajasUsdEurArs(page) {
  await page.locator('#menu-cajas').click();
  await expect(page.locator('#vista-cajas')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#cajas-loading')).toBeHidden({ timeout: 20000 });
  const elU = page.locator('#cajas-saldo-efectivo-usd');
  const elE = page.locator('#cajas-saldo-efectivo-eur');
  const elA = page.locator('#cajas-saldo-efectivo-ars');
  const tu = (await elU.textContent())?.trim() || '–';
  const te = (await elE.isVisible().catch(() => false)) ? ((await elE.textContent())?.trim() || '–') : '–';
  const ta = (await elA.textContent())?.trim() || '–';
  const negU = await elU.evaluate((n) => n.classList.contains('negativo')).catch(() => false);
  const negE = await elE.evaluate((n) => n.classList.contains('negativo')).catch(() => false);
  const negA = await elA.evaluate((n) => n.classList.contains('negativo')).catch(() => false);
  const usdAbs = normalizarMontoSaldo(tu);
  const eurAbs = normalizarMontoSaldo(te);
  const arsAbs = normalizarMontoSaldo(ta);
  return { usd: negU ? -usdAbs : usdAbs, eur: negE ? -eurAbs : eurAbs, ars: negA ? -arsAbs : arsAbs };
}

/** Autocompletado ci_pc: mismo patrón 2 tx para cruces fiat+USD o EUR↔ARS con intermediario. */
const TIPOS = [
  {
    codigo: 'USD-ARS',
    combinaciones: COMBINACIONES_USD_ARS_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(USD_ARS_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(String(USD_ARS_INT_FIJOS.mrUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
  {
    codigo: 'ARS-USD',
    combinaciones: COMBINACIONES_ARS_USD_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(ARS_USD_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-entregado').fill(String(ARS_USD_INT_FIJOS.meUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
  {
    codigo: 'USD-EUR',
    combinaciones: COMBINACIONES_USD_EUR_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(USD_EUR_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(String(USD_EUR_INT_FIJOS.mrUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
  {
    codigo: 'EUR-USD',
    combinaciones: COMBINACIONES_EUR_USD_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(EUR_USD_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-entregado').fill(String(EUR_USD_INT_FIJOS.meUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
  {
    codigo: 'EUR-ARS',
    combinaciones: COMBINACIONES_EUR_ARS_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(EUR_ARS_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(String(EUR_ARS_INT_FIJOS.mrEur));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
  {
    codigo: 'ARS-EUR',
    combinaciones: COMBINACIONES_ARS_EUR_INT_INVERSA,
    fillDetalles: async (page) => {
      await page.locator('#orden-cotizacion').fill(ARS_EUR_INT_FIJOS.cotizacion);
      await page.locator('#orden-monto-entregado').fill(String(ARS_EUR_INT_FIJOS.meEur));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/, { timeout: 15000 });
    },
  },
];

test.describe('CC intermediario inversa: USD/EUR cruces con int', () => {
  test('valida combinaciones P/E con montos fijos', async ({ page }) => {
    test.setTimeout(900000);
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD');

    const filtroTipo = (process.env.TIPO_CODIGO || '').trim();
    const filtroComb = (process.env.COMBINACION_ID || '').trim();
    if (filtroTipo && !TIPOS.some((t) => t.codigo === filtroTipo)) {
      test.skip(true, `TIPO_CODIGO inválido o no cubierto por 03: ${filtroTipo}`);
    }

    console.log('\n======== [E2E 3/5] Intermediario inversa — 03-cc-intermediario-inversa ========');
    if (filtroTipo) console.log(`[E2E] Filtro TIPO_CODIGO=${filtroTipo}${filtroComb ? ` COMBINACION_ID=${filtroComb}` : ''}`);
    console.log('[E2E] Por cada tipo: todas las combinaciones P/E antes de cambiar de código de operación.\n');

    const logRows = [LOG_HEADERS_INV];

    try {
    await loginAndSeeApp(page);
    const rootDir = path.resolve(__dirname, '../..');

    const tiposActivos = TIPOS.filter((t) => !filtroTipo || t.codigo === filtroTipo);
    let tipoOrd = 0;
    for (const tipo of tiposActivos) {
      tipoOrd += 1;
      console.log(`\n--- [E2E 3/5] Tipo con intermediario (inversa) ${tipo.codigo} (${tipoOrd}/${tiposActivos.length}) — ${tipo.combinaciones.length} combinaciones ---`);
      for (const esperado of tipo.combinaciones) {
        if (filtroComb && esperado.id !== filtroComb) continue;
        await test.step(`${tipo.codigo} ${esperado.id}`, async () => {
          console.log(`>>> [${tipo.codigo} ${esperado.id}] inicio combinación`);
          execSync('node scripts/limpiar-base-e2e.js', {
            cwd: rootDir,
            stdio: 'inherit',
            env: { ...process.env, NODE_ENV: 'test' },
          });
          console.log(`... [${tipo.codigo} ${esperado.id}] base limpia`);
          await reloadYEsperarAppLista(page, loginAndSeeApp);

          const nombreIntermediario = 'E2E Int Inversa ' + Date.now();
          console.log(`... [${tipo.codigo} ${esperado.id}] alta cliente/intermediario`);
          await crearCliente(page, CLIENTE_NOMBRE);
          await crearIntermediario(page, nombreIntermediario);
          console.log(`... [${tipo.codigo} ${esperado.id}] crear orden + ir a instrumentación`);
          await crearOrdenConIntermediario(page, tipo, CLIENTE_NOMBRE, nombreIntermediario);
          // Autocompletado (patrón ci_pc elegido antes de Ir a instrumentación) = 2 filas de datos (no el placeholder vacío).
          await expect(page.locator('#orden-inst-tbody tr')).toHaveCount(2, { timeout: 20000 });

          console.log(`... [${tipo.codigo} ${esperado.id}] setear estados ${esperado.tx1},${esperado.tx2}`);
          await setearEstadosTx(page, esperado);

          await page.locator('#orden-btn-cerrar-wizard').click();
          await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });
          console.log(`... [${tipo.codigo} ${esperado.id}] validar CC cliente/intermediario`);

          await page.locator('#menu-cuenta-corriente').click();
          await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 10000 });
          await page.locator('#cc-btn-refrescar').click();
          await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
          await page.waitForTimeout(1000);

          const filaCli = await leerFilaResumen(page, 'cliente', CLIENTE_NOMBRE);
          let cliUSD = 0;
          let cliEUR = 0;
          let cliARS = 0;
          let detalleCli = [];
          if (filaCli) {
            cliUSD = saldoLeidoANumero(await leerSaldoConSigno(filaCli.locator('td[data-cc-moneda-col="USD"]')));
            cliEUR = saldoLeidoANumero(await leerSaldoConSigno(filaCli.locator('td[data-cc-moneda-col="EUR"]')));
            cliARS = saldoLeidoANumero(await leerSaldoConSigno(filaCli.locator('td[data-cc-moneda-col="ARS"]')));
            await filaCli.locator('.btn-ver-detalle').click();
            detalleCli = await leerMontosModalDetalle(page);
          } else if (
            Math.abs(esperado.saldoCliUSD) <= 1 &&
            Math.abs(Number(esperado.saldoCliEUR) || 0) <= 1 &&
            Math.abs(esperado.saldoCliARS) <= 1 &&
            (esperado.detalleCli || []).length > 0
          ) {
            detalleCli = await leerMontosDesdeVistaMovimientos(page, 'cliente', CLIENTE_NOMBRE);
          }

          const filaInt = await leerFilaResumen(page, 'intermediario', nombreIntermediario);
          let intUSD = 0;
          let intEUR = 0;
          let intARS = 0;
          let detalleInt = [];
          if (filaInt) {
            intUSD = saldoLeidoANumero(await leerSaldoConSigno(filaInt.locator('td[data-cc-moneda-col="USD"]')));
            intEUR = saldoLeidoANumero(await leerSaldoConSigno(filaInt.locator('td[data-cc-moneda-col="EUR"]')));
            intARS = saldoLeidoANumero(await leerSaldoConSigno(filaInt.locator('td[data-cc-moneda-col="ARS"]')));
            await filaInt.locator('.btn-ver-detalle').click();
            detalleInt = await leerMontosModalDetalle(page);
          } else if (
            Math.abs(esperado.saldoIntUSD) <= 1 &&
            Math.abs(Number(esperado.saldoIntEUR) || 0) <= 1 &&
            Math.abs(esperado.saldoIntARS) <= 1 &&
            (esperado.detalleInt || []).length > 0
          ) {
            detalleInt = await leerMontosDesdeVistaMovimientos(page, 'intermediario', nombreIntermediario);
          }

          const cajas = await leerCajasUsdEurArs(page);

          const expCli = [...(esperado.detalleCli || [])].sort((a, b) => a - b);
          const expInt = [...(esperado.detalleInt || [])].sort((a, b) => a - b);
          const detSortedCli = [...detalleCli].sort((a, b) => a - b);
          const detSortedInt = [...detalleInt].sort((a, b) => a - b);

          let resDetCli = 'ERR';
          if (expCli.length === 0) resDetCli = 'PASS';
          else if (
            detSortedCli.length === expCli.length &&
            expCli.every((v, i) => Math.abs((detSortedCli[i] || 0) - v) <= 1)
          )
            resDetCli = 'PASS';

          let resDetInt = 'ERR';
          if (expInt.length === 0) resDetInt = 'PASS';
          else if (
            detSortedInt.length === expInt.length &&
            expInt.every((v, i) => Math.abs((detSortedInt[i] || 0) - v) <= 1)
          )
            resDetInt = 'PASS';

          const expCliU = Number(esperado.saldoCliUSD) || 0;
          const expCliE = Number(esperado.saldoCliEUR) || 0;
          const expCliA = Number(esperado.saldoCliARS) || 0;
          const expIntU = Number(esperado.saldoIntUSD) || 0;
          const expIntE = Number(esperado.saldoIntEUR) || 0;
          const expIntA = Number(esperado.saldoIntARS) || 0;
          const expCajaU = Number(esperado.cajaUSD) || 0;
          const expCajaE = Number(esperado.cajaEUR) || 0;
          const expCajaA = Number(esperado.cajaARS) || 0;

          logRows.push([
            tipo.codigo,
            esperado.id,
            expCliU,
            cliUSD,
            ccResumenDisplayMatchAlgebraico(cliUSD, expCliU) ? 'PASS' : 'ERR',
            expCliE,
            cliEUR,
            ccResumenDisplayMatchAlgebraico(cliEUR, expCliE) ? 'PASS' : 'ERR',
            expCliA,
            cliARS,
            ccResumenDisplayMatchAlgebraico(cliARS, expCliA) ? 'PASS' : 'ERR',
            expIntU,
            intUSD,
            ccResumenDisplayMatchAlgebraico(intUSD, expIntU) ? 'PASS' : 'ERR',
            expIntE,
            intEUR,
            ccResumenDisplayMatchAlgebraico(intEUR, expIntE) ? 'PASS' : 'ERR',
            expIntA,
            intARS,
            ccResumenDisplayMatchAlgebraico(intARS, expIntA) ? 'PASS' : 'ERR',
            JSON.stringify(expCli),
            JSON.stringify(detSortedCli),
            resDetCli,
            JSON.stringify(expInt),
            JSON.stringify(detSortedInt),
            resDetInt,
            expCajaU,
            cajas.usd,
            Math.abs(cajas.usd - expCajaU) <= 1 ? 'PASS' : 'ERR',
            expCajaE,
            cajas.eur,
            Math.abs(cajas.eur - expCajaE) <= 1 ? 'PASS' : 'ERR',
            expCajaA,
            cajas.ars,
            Math.abs(cajas.ars - expCajaA) <= 1 ? 'PASS' : 'ERR',
          ]);

          // Resumen CC: fixtures = algebraico; pantalla = −a (cobro) o a (pago Pandy) → min(|L+E|,|L−E|) ≤ 1
          expect(ccResumenDisplayDiffAlgebraico(cliUSD, esperado.saldoCliUSD), `${tipo.codigo} ${esperado.id} saldo cliente USD`).toBeLessThanOrEqual(1);
          expect(ccResumenDisplayDiffAlgebraico(cliEUR, expCliE), `${tipo.codigo} ${esperado.id} saldo cliente EUR`).toBeLessThanOrEqual(1);
          expect(ccResumenDisplayDiffAlgebraico(cliARS, esperado.saldoCliARS), `${tipo.codigo} ${esperado.id} saldo cliente ARS`).toBeLessThanOrEqual(1);
          expect(ccResumenDisplayDiffAlgebraico(intUSD, esperado.saldoIntUSD), `${tipo.codigo} ${esperado.id} saldo inter USD`).toBeLessThanOrEqual(1);
          expect(ccResumenDisplayDiffAlgebraico(intEUR, expIntE), `${tipo.codigo} ${esperado.id} saldo inter EUR`).toBeLessThanOrEqual(1);
          expect(ccResumenDisplayDiffAlgebraico(intARS, esperado.saldoIntARS), `${tipo.codigo} ${esperado.id} saldo inter ARS`).toBeLessThanOrEqual(1);
          expect(Math.abs(cajas.usd - esperado.cajaUSD), `${tipo.codigo} ${esperado.id} caja USD`).toBeLessThanOrEqual(1);
          expect(Math.abs(cajas.eur - expCajaE), `${tipo.codigo} ${esperado.id} caja EUR`).toBeLessThanOrEqual(1);
          expect(Math.abs(cajas.ars - esperado.cajaARS), `${tipo.codigo} ${esperado.id} caja ARS`).toBeLessThanOrEqual(1);
          expect(detSortedCli.length, `${tipo.codigo} ${esperado.id} detalle cliente cantidad`).toBe(expCli.length);
          expect(detSortedInt.length, `${tipo.codigo} ${esperado.id} detalle int cantidad`).toBe(expInt.length);
          for (let i = 0; i < expCli.length; i++) {
            expect(Math.abs((detSortedCli[i] || 0) - expCli[i]), `${tipo.codigo} ${esperado.id} detalle cliente[${i}]`).toBeLessThanOrEqual(1);
          }
          for (let i = 0; i < expInt.length; i++) {
            expect(Math.abs((detSortedInt[i] || 0) - expInt[i]), `${tipo.codigo} ${esperado.id} detalle int[${i}]`).toBeLessThanOrEqual(1);
          }
          console.log(`✓ [${tipo.codigo} ${esperado.id}] OK`);
        });
      }
    }
    console.log('\n======== [E2E 3/5] Fin intermediario inversa ========\n');
    } finally {
      escribirLogInversa(logRows);
    }
  });
});

