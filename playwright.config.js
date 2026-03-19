// Cargar credenciales de prueba desde .env.test (no subir .env.test al repo)
const path = require('path');
require('dotenv').config({ path: '.env.test' });

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:5173';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'tests/e2e',
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.js'),
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
