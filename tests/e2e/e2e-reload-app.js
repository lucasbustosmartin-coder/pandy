// @ts-check
/**
 * Tras `limpiar-base-e2e` + reload, el sidebar sigue en `display:none` hasta que termina
 * `getSession` → permisos → `showAppContent()`. Con red lenta o mucha carga, 15s no alcanza.
 * Si la sesión expiró, queda visible `#login-screen`: se reintenta login.
 */
const { expect } = require('@playwright/test');

const POLL_MS = 300;
const MAX_WAIT_MS = 75000;

/**
 * @param {import('@playwright/test').Page} page
 * @param {(p: import('@playwright/test').Page) => Promise<void>} loginAndSeeApp
 */
async function reloadYEsperarAppLista(page, loginAndSeeApp) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  const sidebar = page.locator('#sidebar');
  const login = page.locator('#login-screen');
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_WAIT_MS) {
    if (await sidebar.isVisible().catch(() => false)) return;
    if (await login.isVisible().catch(() => false)) {
      await loginAndSeeApp(page);
      return;
    }
    await page.waitForTimeout(POLL_MS);
  }
  if (await login.isVisible().catch(() => false)) {
    await loginAndSeeApp(page);
    return;
  }
  await expect(sidebar).toBeVisible({ timeout: 10000 });
}

module.exports = { reloadYEsperarAppLista };
