// @ts-check
/**
 * E2E: combinaciones Tx1/Tx2 (P/E) para tipos de operación con **2 transacciones**:
 * ARS-USD, USD-ARS, USD-USD (sin intermediario), USD-USD (con intermediario y reparto comisión).
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
const { execSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { reloadYEsperarAppLista } = require('./e2e-reload-app');
const { writeSuiteSheet } = require('./cc-combinaciones-log-workbook');
const {
  ARS_USD_FIJOS,
  USD_ARS_FIJOS,
  USD_USD_FIJOS,
  COMBINACIONES_ARS_USD,
  COMBINACIONES_USD_ARS,
  COMBINACIONES_USD_USD,
  COMBINACIONES_USD_USD_INT,
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
async function esperarSaldosResumenCliente(page, tbodyCc, nombreCliente, expU, expA, timeoutMs = 60000) {
  const start = Date.now();
  let lastUsd = 0;
  let lastArs = 0;
  let lastCount = 0;
  while (Date.now() - start < timeoutMs) {
    const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
    const countCli = await filaCliente.count();
    lastCount = countCli;
    if (countCli === 0) {
      lastUsd = 0;
      lastArs = 0;
      if (Math.abs(expU) <= 1 && Math.abs(expA) <= 1) {
        return { saldoUSD: 0, saldoARS: 0, countCli: 0 };
      }
    } else {
      const tUsd = await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(2)'));
      const tArs = await leerSaldoConSigno(filaCliente.first().locator('td:nth-child(4)'));
      lastUsd = saldoLeidoANumero(tUsd);
      lastArs = saldoLeidoANumero(tArs);
      if (Math.abs(lastUsd - expU) <= 1 && Math.abs(lastArs - expA) <= 1) {
        return { saldoUSD: lastUsd, saldoARS: lastArs, countCli };
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error(
    `Timeout saldo CC cliente "${nombreCliente}": esperado USD=${expU} ARS=${expA}; último count=${lastCount} USD=${lastUsd} ARS=${lastArs}`
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

async function leerCajasUsdArs(page) {
  const usd = await leerSaldoCajaEfectivoUSD(page);
  const ars = await leerSaldoCajaEfectivoARS(page);
  return { usd, ars };
}

/**
 * Montos del modal Ver detalle (cols USD=6, ARS=7). Sin EUR: un 0 en EUR puede inflar el conteo.
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
    for (const col of [6, 7]) {
      const texto = await leerSaldoConSigno(filas.nth(f).locator(`td:nth-child(${col})`));
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
      for (const col of [6, 7]) {
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
    usaIntermediario: false,
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
      await expect(page.locator('#orden-wrap-primeros-datos')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#orden-wrap-comision-split')).toBeVisible({ timeout: 5000 });
      await page.locator('#orden-importe-cheque').fill(USD_USD_FIJOS.importe);
      await page.locator('#orden-tasa-descuento-cliente').fill(USD_USD_FIJOS.tasaCliente);
      await page.waitForTimeout(500);
      await expect(page.locator('#orden-monto-recibido')).toHaveValue(/.+/);
      await expect(page.locator('#orden-monto-entregado')).toHaveValue(/.+/);
      await page.locator('#orden-comision-pandy-pct').fill('50');
      await page.locator('#orden-comision-intermediario-pct').fill('50');
      await page.waitForTimeout(300);
    },
  },
];

test.describe('CC tipos 2 transacciones: combinaciones P/E Tx1 Tx2', () => {
  test.beforeEach(async () => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }
  });

  test('ARS-USD, USD-ARS, USD-USD, USD-USD+int — datos fijos y validación por combinación', async ({ page }) => {
    test.setTimeout(1200000);

    const filtroTipo = (process.env.TIPO_CODIGO || '').trim();
    const filtroComb = (process.env.COMBINACION_ID || '').trim();
    /** Con `TIPO_CODIGO=USD-USD`, solo `true` corre el tipo con intermediario; cualquier otro valor deja solo sin intermediario. */
    const filtroUsaInt = (process.env.TIPO_USA_INTERMEDIARIO || '').trim().toLowerCase();

    console.log('\n======== [E2E 2/5] Tipos 2 transacciones (ARS-USD → USD-ARS → USD-USD → USD-USD+int) — 02-cc-tipos-activos ========');
    console.log('[E2E] Dentro de este archivo: por cada tipo se ejecutan las 4 combinaciones P/E antes de pasar al siguiente.\n');

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
            try {
              execSync('node scripts/limpiar-base-e2e.js', {
                cwd: rootDir,
                stdio: 'inherit',
                env: { ...process.env, NODE_ENV: 'test' },
              });
            } catch (e) {
              if (e.status !== 0) console.warn(`  [${cfg.codigo} ${esperado.id}] limpiar-base-e2e falló; continuando.`);
            }
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
                await expect(opt).toHaveCount(1, { timeout: 5000 });
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
                const expA = Number(esperado.saldoARS) || 0;

                await page.locator('#menu-cuenta-corriente').click();
                await expect(page.locator('#vista-cuenta-corriente')).toBeVisible({ timeout: 10000 });
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });
                await page.locator('#cc-btn-refrescar').click();
                await expect(page.locator('#cc-loading')).toBeHidden({ timeout: 60000 });

                await page.locator('#cc-filtro-tipo button[data-tipo="cliente"]').click();
                await expect(page.locator('#cc-filtro-tipo button[data-tipo="cliente"].activo')).toBeVisible({ timeout: 5000 });
                await page.waitForTimeout(500);

                const { saldoUSD, saldoARS, countCli } = await esperarSaldosResumenCliente(
                  page,
                  tbodyCc,
                  nombreCliente,
                  expU,
                  expA,
                  60000
                );
                const filaCliente = await obtenerFilaClientePorNombre(tbodyCc, page, nombreCliente);
                const diffU = countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expA) <= 1 ? 0 : Math.abs(saldoUSD - expU);
                const diffA = countCli === 0 && Math.abs(expU) <= 1 && Math.abs(expA) <= 1 ? 0 : Math.abs(saldoARS - expA);
                if (countCli === 0 && (Math.abs(expU) > 1 || Math.abs(expA) > 1)) {
                  throw new Error(`${cfg.codigo} ${esperado.id}: sin fila cliente pero se esperaba saldo USD=${expU} ARS=${expA}`);
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

                /** CC intermediario (USD): solo tipos con `usaIntermediario`; E,E → mitad de comisión total (50/50). */
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
                    const tUsdInt = await leerSaldoConSigno(filaInt.first().locator('td:nth-child(2)'));
                    saldoInt = saldoLeidoANumero(tUsdInt);
                  }
                  saldoIntCell = saldoInt;
                  const diffInt = countInt === 0 && Math.abs(expI) <= 1 ? 0 : Math.abs(saldoInt - expI);
                  rdoInt = diffInt <= 1 ? 'PASS' : 'ERR';
                  if (countInt === 0 && Math.abs(expI) > 1) {
                    throw new Error(`${cfg.codigo}+int ${esperado.id}: sin fila intermediario pero se esperaba saldo USD=${expI}`);
                  }
                  expect(diffInt, `${cfg.codigo}+int ${esperado.id}: saldo Int USD esp ${expI} app ${saldoInt}`).toBeLessThanOrEqual(1);
                }

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
                  expIntCell,
                  saldoIntCell,
                  rdoInt,
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
