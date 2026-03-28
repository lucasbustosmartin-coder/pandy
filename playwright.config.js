// Cargar .env.test (no subir al repo). SUPABASE_* ahí = proyecto desarrollo, alineado a config.js / volcar Pandy-Dev.
const path = require('path');
require('dotenv').config({ path: '.env.test' });

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:5173';

/**
 * Orden de archivos E2E (workers=1, fullyParallel=false): Playwright ejecuta los `.spec.js`
 * en orden lexicográfico. Los nombres con prefijo numérico aseguran:
 *   01 CHEQUE-ARS (12 combinaciones) → 02 tipos 2 tx (ARS-USD, USD-ARS, USD-USD) →
 *   03 intermediario inversa (USD-ARS / ARS-USD con int.) → 90 login → 91 orden-cc.
 */
/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'tests/e2e',
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.js'),
  globalTeardown: path.join(__dirname, 'tests', 'e2e', 'global-teardown.js'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    headless: !!process.env.CI,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  timeout: 30000,
  expect: { timeout: 10000 },
};
