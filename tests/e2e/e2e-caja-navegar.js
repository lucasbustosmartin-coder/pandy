// @ts-check
const { expect } = require('@playwright/test');

/**
 * Abre la vista Cajas (si no está activa) y espera a que termine la carga de saldos.
 * Evita doble clic en #menu-cajas (cada clic dispara loadCajas() y puede dejar #cajas-loading colgado).
 */
async function navegarVistaCajasYEsperarCarga(page) {
  const vista = page.locator('#vista-cajas');
  const yaCajas = await vista
    .evaluate((el) => el && window.getComputedStyle(el).display === 'block')
    .catch(() => false);
  if (!yaCajas) {
    await page.locator('#menu-cajas').scrollIntoViewIfNeeded();
    await page.locator('#menu-cajas').click({ timeout: 15000 });
  }
  await expect(vista).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cajas-saldos')).toBeVisible({ timeout: 15000 });
  const loading = page.locator('#cajas-loading');
  try {
    await loading.waitFor({ state: 'hidden', timeout: 25000 });
  } catch {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const otra = await vista
      .evaluate((el) => el && window.getComputedStyle(el).display === 'block')
      .catch(() => false);
    if (!otra) {
      await page.locator('#menu-cajas').scrollIntoViewIfNeeded();
      await page.locator('#menu-cajas').click({ timeout: 15000 });
      await expect(vista).toBeVisible({ timeout: 10000 });
    }
    await loading.waitFor({ state: 'hidden', timeout: 20000 });
  }
}

module.exports = { navegarVistaCajasYEsperarCarga };
