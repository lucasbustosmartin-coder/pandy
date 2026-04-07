// @ts-check
/**
 * E2E: combinaciones Tx1/Tx2 (P/E) para tipos de operación con **2 transacciones**:
 * ARS-USD, USD-ARS, EUR-USD, USD-EUR, EUR-ARS, ARS-EUR, USD-USD (sin intermediario), USD-USD (con intermediario: patrón + tasa cliente sobre importe, tasa intermediario sobre monto recibido mr).
 *
 * CHEQUE-ARS (4 tx + intermediario) no está aquí: usar `tests/e2e/01-cc-combinaciones.spec.js`.
 * Todos los tipos activos sin duplicar: `npm run test:e2e-cc-activos-completo` (01 CHEQUE + este 02 + 03 inversa int.; no incluye 91).
 *
 * Expectativas enteras: `cc-tipos-activos-esperado.js`. Log numérico en Excel (importes como number), hoja **CC Tipos 2tx** en `test-results/cc-combinaciones-log.xlsx`.
 *
 * Filtros (opcional):
 *   TIPO_CODIGO=ARS-USD COMBINACION_ID="E,P" npx playwright test tests/e2e/02-cc-tipos-activos-combinaciones.spec.js --headed
 *
 * Con `TIPO_CODIGO=USD-USD`, por defecto solo corre **sin** intermediario. Para **con** intermediario (mismas 4 combinaciones P/E; Tx2 = Intermediario→Cliente; CC int en E,E):
 *   TIPO_CODIGO=USD-USD TIPO_USA_INTERMEDIARIO=true ...
 *   npm run test:e2e-cc-usd-usd-int-combos
 *
 * Solo USD-ARS sin intermediario (4 combinaciones P/E; `reglas_de_negocio`):
 *   npm run test:e2e-cc-usd-ars-sin-int
 * Solo ARS-USD sin intermediario:
 *   npm run test:e2e-cc-ars-usd-sin-int
 * Solo USD-USD sin intermediario (comisión implícita mr − me; ver docs/USD_USD_SIN_INTERMEDIARIO.md):
 *   npm run test:e2e-cc-usd-usd-sin-int
 */
const path = require('path');
const { ccResumenDisplayMatchAlgebraico, ccResumenDisplayDiffAlgebraico } = require('./cc-resumen-optica-match');
const { execSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { reloadYEsperarAppLista } = require('./e2e-reload-app');
const { writeSuiteSheet } = require('./cc-combinaciones-log-workbook');
const {
  ARS_USD_FIJOS,
  USD_ARS_FIJOS,
  USD_USD_FIJOS,
  EUR_USD_FIJOS,
  USD_EUR_FIJOS,
  EUR_ARS_FIJOS,
  ARS_EUR_FIJOS,
  COMBINACIONES_ARS_USD,
  COMBINACIONES_USD_ARS,
  COMBINACIONES_USD_USD,
  COMBINACIONES_USD_USD_INT,
  COMBINACIONES_EUR_USD,
  COMBINACIONES_USD_EUR,
  COMBINACIONES_EUR_ARS,
  COMBINACIONES_ARS_EUR,
} = require('./cc-tipos-activos-esperado');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

const CLIENTE_TIPOS_2TX = 'E2E CC TiposActivos';
const INTERMEDIARIO_TIPOS_2TX = 'E2E CC TiposActivos Int';

const LOG_HEADERS = [
  'Tipo',
  'Combinación',
  'Exp USD',
  'Real USD',
  'Rdo USD',
  'Exp EUR',
  'Real EUR',
  'Rdo EUR',
  'Exp ARS',
  'Real ARS',
  'Rdo ARS',
  'Exp Detalle',
  'Real Detalle',
  'Rdo Detalle',
  'Exp Caja USD',
  'Real Caja USD',
  'Rdo Caja USD',
  'Exp Caja EUR',
  'Real Caja EUR',
  'Rdo Caja EUR',
  'Exp Caja ARS',
  'Real Caja ARS',
  'Rdo Caja ARS',
  'Exp Int USD',
  'Real Int USD',
  'Rdo Int USD',
];

function escribirLogExcel(logRows) {
  writeSuiteSheet('CC Tipos 2tx', logRows);
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
  // `:has()` acotado al tbody: evita ambigüedad con `filter({ has: page.locator(...) })` en algunas versiones de Playwright.
  const rows = tbodyCc.locator('tr:has(button[data-tipo="cliente"])');
  if (!nombre) return rows;
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cellText = (await rows.nth(i).locator('td').first().textContent())?.trim() || '';
    if (cellText === nombre) return rows.nth(i);
  }
  return tbodyCc.locator('tr').filter({ hasText: 'nunca-coincide-e2e-' + nombre });
}

async function obtenerFilaIntermediarioPorNombre(tbodyCc, page, nombreIntermediario) {
  const nombre = (nombreIntermediario || '').trim();
  const rows = tbodyCc.locator('tr:has(button[data-tipo="intermediario"])');
  if (!nombre) return rows;
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cellText = (await rows.nth(i).locator('td').first().textContent())?.trim() || '';
    if (cellText === nombre) return rows.nth(i);
  }
  return tbodyCc.locator('tr').filter({ hasText: 'nunca-coincide-e2e-int-' + nombre });
}

/**
 * Tras Refrescar CC, el sync + load puede tardar más que un `waitForTimeout` fijo; la UI puede mostrar un saldo intermedio.
 * Relee hasta coincidir con lo esperado (±1) o timeout.
 */
async function esperarSaldosResumenCliente(page, tbodyCc, nombreCliente, expU, expE, expA, timeoutMs = 60000) {
  const start = Date.now();
  let lastUsd = 0;
  let lastEur = 0;
  let lastArs = 0;
  let lastCount = 0;
  while (Date.now() - start < timeoutMs) {
    const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
    const countCli = await filaCliente.count();
    lastCount = countCli;
    if (countCli === 0) {
      lastUsd = 0;
      lastEur = 0;
      lastArs = 0;
      if (Math.abs(expU) <= 1 && Math.abs(expE) <= 1 && Math.abs(expA) <= 1) {
        return { saldoUSD: 0, saldoEUR: 0, saldoARS: 0, countCli: 0 };
      }
    } else {
      const row = filaCliente.first();
      const tUsd = await leerSaldoConSigno(row.locator('td[data-cc-moneda-col="USD"]'));
      const tEur = await leerSaldoConSigno(row.locator('td[data-cc-moneda-col="EUR"]'));
      const tArs = await leerSaldoConSigno(row.locator('td[data-cc-moneda-col="ARS"]'));
      lastUsd = saldoLeidoANumero(tUsd);
      lastEur = saldoLeidoANumero(tEur);
      lastArs = saldoLeidoANumero(tArs);
      if (
        ccResumenDisplayMatchAlgebraico(lastUsd, expU) &&
        ccResumenDisplayMatchAlgebraico(lastEur, expE) &&
        ccResumenDisplayMatchAlgebraico(lastArs, expA)
      ) {
        return { saldoUSD: lastUsd, saldoEUR: lastEur, saldoARS: lastArs, countCli };
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error(
    `Timeout saldo CC cliente "${nombreCliente}": esperado USD=${expU} EUR=${expE} ARS=${expA}; último count=${lastCount} USD=${lastUsd} EUR=${lastEur} ARS=${lastArs}`
  );
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

async function leerSaldoCajaEfectivoEUR(page) {
  const el = page.locator('#cajas-saldo-efectivo-eur');
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

async function leerCajasUsdEurArs(page) {
  const usd = await leerSaldoCajaEfectivoUSD(page);
  const eur = await leerSaldoCajaEfectivoEUR(page);
  const ars = await leerSaldoCajaEfectivoARS(page);
  return { usd, eur, ars };
}

/**
 * Montos del modal Ver detalle (columnas `data-cc-moneda-col` USD / ARS / EUR).
 * No cierra el modal.
 */
async function leerMontosModalDetalleClienteAbierto(page) {
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#modal-cc-detalle-loading')).toBeHidden({ timeout: 15000 });
  await page.waitForSelector('#cc-detalle-tbody tr:nth-of-type(1)', { timeout: 10000 });
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
  return [...montos].sort((a, b) => a - b);
}

/**
 * Igual que leerMontosModalDetalleClienteAbierto y cierra el modal.
 */
async function leerMontosModalDetalleCliente(page) {
  const sorted = await leerMontosModalDetalleClienteAbierto(page);
  await page.locator('#modal-cc-detalle-close').click();
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
  return sorted;
}

/**
 * Tras abrir "Ver detalle", el fetch del modal puede coincidir con un sync intermedio (p. ej. ARS-USD P,E: 4 celdas → 3).
 * Relee hasta que el multiset ordenado coincida con lo esperado (±1) o timeout.
 */
async function esperarMontosModalDetalleCliente(page, esperadoSorted, timeoutMs = 20000) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < timeoutMs) {
    last = await leerMontosModalDetalleClienteAbierto(page);
    if (
      esperadoSorted.length === last.length &&
      esperadoSorted.every((v, i) => Math.abs((last[i] || 0) - v) <= 1)
    ) {
      await page.locator('#modal-cc-detalle-close').click();
      await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 });
      return last;
    }
    await page.waitForTimeout(400);
  }
  await page.locator('#modal-cc-detalle-close').click().catch(() => {});
  await expect(page.locator('#modal-cc-detalle-backdrop.activo')).toBeHidden({ timeout: 3000 }).catch(() => {});
  throw new Error(
    `Timeout detalle CC modal: esp ${JSON.stringify(esperadoSorted)} último ${JSON.stringify(last)} (${timeoutMs}ms)`
  );
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
    await page.locator('#cc-detalle-btn-todo-historial').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const selEnt = page.locator('#cc-detalle-entidad-select');
    if ((await selEnt.count()) > 0) {
      const optMatch = selEnt.locator('option').filter({ hasText: nombre });
      if ((await optMatch.count()) > 0) {
        const val = await optMatch.first().getAttribute('value');
        if (val) await selEnt.selectOption(val);
        await page.waitForTimeout(400);
      }
    }
    const tbody = page.locator('#cc-vista-detalle-tbody');
    await tbody.waitFor({ state: 'visible', timeout: 3000 });
    const allRows = tbody.locator('tr');
    const count = await allRows.count();
    const montos = [];
    for (let i = 0; i < count; i++) {
      const row = allRows.nth(i);
      for (const mon of ['USD', 'ARS', 'EUR']) {
        const texto = await leerSaldoConSigno(row.locator(`td[data-cc-moneda-col="${mon}"]`));
        if (texto !== '–' && /\d/.test(texto)) montos.push(saldoLeidoANumero(texto));
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
    usaIntermediario: false,
    combinaciones: COMBINACIONES_ARS_USD,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(ARS_USD_FIJOS.cotizacion);
      // compra_usd: campo operativo = monto entregado (USD); recibido (ARS) se calcula con TC.
      await page.locator('#orden-monto-entregado').fill(String(ARS_USD_FIJOS.montoEntregadoUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'USD-ARS',
    usaIntermediario: false,
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
    usaIntermediario: false,
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
  {
    codigo: 'USD-USD',
    usaIntermediario: true,
    combinaciones: COMBINACIONES_USD_USD_INT,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-wrap-int-patron-instrumentacion')).toBeVisible({ timeout: 5000 });
      await page.locator('input[name="orden-int-patron-radio"][value="cp_ic"]').check();
      await expect(page.locator('#orden-wrap-primeros-datos')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#orden-wrap-tasa-descuento-intermediario')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-importe-cheque').fill(USD_USD_FIJOS.importe);
      await page.locator('#orden-tasa-descuento-cliente').fill(USD_USD_FIJOS.tasaCliente);
      await page.locator('#orden-tasa-descuento-intermediario').fill('1,5');
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'EUR-USD',
    usaIntermediario: false,
    combinaciones: COMBINACIONES_EUR_USD,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(EUR_USD_FIJOS.cotizacion);
      await page.locator('#orden-monto-entregado').fill(String(EUR_USD_FIJOS.montoEntregadoUsd));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'USD-EUR',
    usaIntermediario: false,
    combinaciones: COMBINACIONES_USD_EUR,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(USD_EUR_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(USD_EUR_FIJOS.montoRecibidoUsd);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'EUR-ARS',
    usaIntermediario: false,
    combinaciones: COMBINACIONES_EUR_ARS,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(EUR_ARS_FIJOS.cotizacion);
      await page.locator('#orden-monto-recibido').fill(EUR_ARS_FIJOS.montoRecibidoEur);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
    },
  },
  {
    codigo: 'ARS-EUR',
    usaIntermediario: false,
    combinaciones: COMBINACIONES_ARS_EUR,
    fillDetalles: async (page) => {
      await expect(page.locator('#orden-cotizacion')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-cotizacion').fill(ARS_EUR_FIJOS.cotizacion);
      await page.locator('#orden-monto-entregado').fill(String(ARS_EUR_FIJOS.montoEntregadoEur));
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
    },
  },
];

test.describe('CC tipos 2 transacciones: combinaciones P/E Tx1 Tx2', () => {
  test.beforeEach(async () => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('Tipos 2 tx (ARS/USD/EUR, USD-USD±int) — datos fijos y validación por combinación', async ({ page }) => {
    test.setTimeout(1200000);

    const filtroTipo = (process.env.TIPO_CODIGO || '').trim();
    const filtroComb = (process.env.COMBINACION_ID || '').trim();
    /** Con `TIPO_CODIGO=USD-USD`, solo `true` corre el tipo con intermediario; cualquier otro valor deja solo sin intermediario. */
    const filtroUsaInt = (process.env.TIPO_USA_INTERMEDIARIO || '').trim().toLowerCase();

    console.log('\n======== [E2E 2/5] Tipos 2 transacciones (ARS/USD/EUR + USD-USD ±int) — 02-cc-tipos-activos ========');
    console.log('[E2E] Por cada tipo: 4 combinaciones P/E (requiere tipos EUR activos en Supabase). Orden del suite: ver TIPOS_SUITE.\n');

    await loginAndSeeApp(page);

    if (filtroTipo && !TIPOS_SUITE.some((t) => t.codigo === filtroTipo)) {
      test.skip(true, `TIPO_CODIGO inválido o no cubierto por este spec: ${filtroTipo}`);
    }

    const nombreCliente = CLIENTE_TIPOS_2TX;
    const nombreIntermediario = INTERMEDIARIO_TIPOS_2TX;
    const tbodyCc = page.locator('#cc-resumen-tbody');
    const logRows = [LOG_HEADERS];
    const rootDir = path.resolve(__dirname, '../..');
    let ranAny = false;

    try {
      let tipoIdx = 0;
      for (const cfg of TIPOS_SUITE) {
        if (filtroTipo && cfg.codigo !== filtroTipo) continue;
        if (cfg.codigo === 'USD-USD' && filtroTipo === 'USD-USD') {
          if (filtroUsaInt === 'true') {
            if (cfg.usaIntermediario !== true) continue;
          } else if (cfg.usaIntermediario === true) continue;
        }

        tipoIdx += 1;
        const tiposActivos = TIPOS_SUITE.filter((t) => !filtroTipo || t.codigo === filtroTipo);
        const nTipos = tiposActivos.length;
        console.log(`\n--- [E2E 2/5] Tipo de operación ${cfg.codigo} (${tipoIdx}/${nTipos}) — ${cfg.combinaciones.length} combinaciones Tx1/Tx2 ---`);

        let combIdx = 0;
        for (const esperado of cfg.combinaciones) {
          if (filtroComb && esperado.id !== filtroComb) continue;

          combIdx += 1;
          console.log(`>>> [${cfg.codigo}] Combinación ${combIdx}/${cfg.combinaciones.length}: ${esperado.id}`);
          ranAny = true;

          await test.step(`${cfg.codigo} ${esperado.id}`, async () => {
            // Sin timeout por combinación: E,E + red lenta puede superar 5–10 min (2× esperar orden + CC + sync).
            // El test completo tiene test.setTimeout(900000).
            execSync('node scripts/limpiar-base-e2e.js', {
              cwd: rootDir,
              stdio: 'inherit',
              env: { ...process.env, NODE_ENV: 'test' },
            });
            await reloadYEsperarAppLista(page, loginAndSeeApp);

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

                if (cfg.usaIntermediario === true) {
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
                  await page.waitForTimeout(400);
                }

                await page.locator('#menu-ordenes').click();
                await expect(page.locator('#vista-ordenes')).toBeVisible({ timeout: 5000 });
                await page.locator('#btn-nueva-orden').click();
                await expect(page.locator('#modal-orden-backdrop.activo')).toBeVisible({ timeout: 5000 });

                const usaInt = cfg.usaIntermediario === true ? 'true' : 'false';
                const opt = page.locator(`#orden-tipo-operacion option[data-codigo="${cfg.codigo}"][data-usa-intermediario="${usaInt}"]`);
                // Catálogo tipos llega async tras permisos; 5s es corto en CI / red lenta (flaky EUR-USD sin int).
                await expect(opt).toHaveCount(1, { timeout: 20000 });
                const valueTipo = await opt.getAttribute('value');
                await page.locator('#orden-tipo-operacion').selectOption(valueTipo);
                if (cfg.usaIntermediario === true) {
                  await expect(page.locator('#orden-wrap-intermediario')).toBeVisible({ timeout: 5000 });
                  await page.locator('#orden-intermediario').selectOption({ label: nombreIntermediario });
                } else {
                  await page.locator('#orden-wrap-intermediario').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
                }

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

                const expU = Number(esperado.saldoUSD) || 0;
                const expE = Number(esperado.saldoEUR) || 0;
                const expA = Number(esperado.saldoARS) || 0;

                await page.locator('#menu-cuenta-corriente').click();
                await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 10000 });
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
                await page.locator('#cc-btn-refrescar').click();
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });

                await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
                await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
                await page.waitForTimeout(500);

                const { saldoUSD, saldoEUR, saldoARS, countCli } = await esperarSaldosResumenCliente(
                  page,
                  tbodyCc,
                  nombreCliente,
                  expU,
                  expE,
                  expA,
                  60000
                );
                const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
                const diffU =
                  countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expE) <= 1 && Math.abs(expA) <= 1 ? 0 : ccResumenDisplayDiffAlgebraico(saldoUSD, expU);
                const diffE =
                  countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expE) <= 1 && Math.abs(expA) <= 1 ? 0 : ccResumenDisplayDiffAlgebraico(saldoEUR, expE);
                const diffA =
                  countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expE) <= 1 && Math.abs(expA) <= 1 ? 0 : ccResumenDisplayDiffAlgebraico(saldoARS, expA);
                if (countCli === 0 && (Math.abs(expU) > 1 || Math.abs(expE) > 1 || Math.abs(expA) > 1)) {
                  throw new Error(
                    `${cfg.codigo} ${esperado.id}: sin fila cliente pero se esperaba saldo USD=${expU} EUR=${expE} ARS=${expA}`
                  );
                }

                const esperadoSorted = [...(esperado.detalleCliente || [])].sort((a, b) => a - b);
                let appSorted = [];

                if (countCli > 0) {
                  try {
                    await filaCliente.first().locator('.btn-ver-detalle').click({ timeout: 15000 });
                    appSorted =
                      esperadoSorted.length > 0
                        ? await esperarMontosModalDetalleCliente(page, esperadoSorted, 25000)
                        : await leerMontosModalDetalleCliente(page);
                  } catch {
                    if (esperadoSorted.length > 0) {
                      const leido = await leerMontosDesdeVistaDetalle(page, nombreCliente);
                      if (leido.length > 0) appSorted = leido;
                    }
                  }
                } else if (esperadoSorted.length > 0) {
                  const leido = await leerMontosDesdeVistaDetalle(page, nombreCliente);
                  if (leido.length > 0) appSorted = leido;
                }

                let resDet = 'ERR';
                if (esperadoSorted.length === 0) resDet = 'PASS';
                else if (appSorted.length === esperadoSorted.length && esperadoSorted.every((v, i) => Math.abs((appSorted[i] || 0) - v) <= 1))
                  resDet = 'PASS';

                /** CC intermediario (USD): solo tipos con `usaIntermediario`; E,E → −(me + comisión int. % sobre me) en convención app. */
                let expIntCell = '';
                let saldoIntCell = '';
                let rdoInt = '';
                if (cfg.usaIntermediario === true) {
                  const expI = Number(esperado.saldoIntermediarioUSD) || 0;
                  expIntCell = expI;
                  await page.locator('#cc-filtro-tipo button[data-tipo="intermediario"]').click();
                  await expect(page.locator('#cc-filtro-tipo button[data-tipo="intermediario"].activo')).toBeVisible({ timeout: 5000 });
                  await page.waitForTimeout(400);
                  const filaInt = await obtenerFilaIntermediarioPorNombre(tbodyCc, page, nombreIntermediario);
                  const countInt = await filaInt.count();
                  let saldoInt = 0;
                  if (countInt > 0) {
                    const tUsdInt = await leerSaldoConSigno(filaInt.first().locator('td[data-cc-moneda-col="USD"]'));
                    saldoInt = saldoLeidoANumero(tUsdInt);
                  }
                  saldoIntCell = saldoInt;
                  const diffInt = countInt === 0 && Math.abs(expI) <= 1 ? 0 : ccResumenDisplayDiffAlgebraico(saldoInt, expI);
                  rdoInt = diffInt <= 1 ? 'PASS' : 'ERR';
                  if (countInt === 0 && Math.abs(expI) > 1) {
                    throw new Error(`${cfg.codigo}+int ${esperado.id}: sin fila intermediario pero se esperaba saldo USD=${expI}`);
                  }
                  expect(diffInt, `${cfg.codigo}+int ${esperado.id}: saldo Int USD esp ${expI} app ${saldoInt}`).toBeLessThanOrEqual(1);
                }

                let realCajaUsd;
                let realCajaEur;
                let realCajaArs;
                {
                  const first = await leerCajasUsdEurArs(page);
                  realCajaUsd = first.usd;
                  realCajaEur = first.eur;
                  realCajaArs = first.ars;
                }
                const expCajaU = Number(esperado.cajaUSD) || 0;
                const expCajaE = Number(esperado.cajaEUR) || 0;
                const expCajaA = Number(esperado.cajaARS) || 0;
                if (expCajaU !== 0 && realCajaUsd === 0) {
                  await page.waitForTimeout(3000);
                  const again = await leerCajasUsdEurArs(page);
                  realCajaUsd = again.usd;
                  realCajaEur = again.eur;
                  realCajaArs = again.ars;
                }
                const diffCajaU = Math.abs(realCajaUsd - expCajaU);
                const diffCajaE = Math.abs(realCajaEur - expCajaE);
                const diffCajaA = Math.abs(realCajaArs - expCajaA);

                const rdoU = diffU <= 1 ? 'PASS' : 'ERR';
                const rdoE = diffE <= 1 ? 'PASS' : 'ERR';
                const rdoA = diffA <= 1 ? 'PASS' : 'ERR';
                const rdoCajaU = diffCajaU <= 1 ? 'PASS' : 'ERR';
                const rdoCajaE = diffCajaE <= 1 ? 'PASS' : 'ERR';
                const rdoCajaA = diffCajaA <= 1 ? 'PASS' : 'ERR';

                logRows.push([
                  cfg.codigo,
                  esperado.id,
                  expU,
                  saldoUSD,
                  rdoU,
                  expE,
                  saldoEUR,
                  rdoE,
                  expA,
                  saldoARS,
                  rdoA,
                  JSON.stringify(esperadoSorted),
                  JSON.stringify(appSorted),
                  resDet,
                  expCajaU,
                  realCajaUsd,
                  rdoCajaU,
                  expCajaE,
                  realCajaEur,
                  rdoCajaE,
                  expCajaA,
                  realCajaArs,
                  rdoCajaA,
                  expIntCell,
                  saldoIntCell,
                  rdoInt,
                ]);

                expect(diffU, `${cfg.codigo} ${esperado.id}: saldo USD esp ${expU} app ${saldoUSD}`).toBeLessThanOrEqual(1);
                expect(diffE, `${cfg.codigo} ${esperado.id}: saldo EUR esp ${expE} app ${saldoEUR}`).toBeLessThanOrEqual(1);
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
                expect(diffCajaE, `${cfg.codigo} ${esperado.id}: caja EUR esp ${expCajaE} app ${realCajaEur}`).toBeLessThanOrEqual(1);
                expect(diffCajaA, `${cfg.codigo} ${esperado.id}: caja ARS esp ${expCajaA} app ${realCajaArs}`).toBeLessThanOrEqual(1);
                console.log(`    ✓ [${cfg.codigo}] ${esperado.id} OK\n`);
          });
        }
      }
      console.log('\n======== [E2E 2/5] Fin tipos 2 transacciones ========\n');
      if (!ranAny) {
        throw new Error('No se ejecutó ninguna combinación. Revisá TIPO_CODIGO y COMBINACION_ID.');
      }
    } finally {
      escribirLogExcel(logRows);
    }
  });
});
