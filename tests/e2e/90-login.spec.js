// @ts-check
const { test, expect } = require('@playwright/test');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

test.describe('Login y smoke', () => {
  test.beforeAll(() => {
    console.log('\n======== [E2E 4/5] Login y smoke — 90-login.spec.js ========\n');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('debe mostrar pantalla de login si no hay sesión', async ({ page }) => {
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('login con usuario de prueba y ver app', async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }

    await expect(page.locator('#login-screen')).toBeVisible();
    await page.locator('#login-email').fill(TEST_USER_EMAIL);
    await page.locator('#login-password').fill(TEST_USER_PASSWORD);
    await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();

    // Esperar resultado del login (Supabase es asíncrono): éxito = login se oculta, error = #login-error tiene texto
    const loginError = page.locator('#login-error');
    const success = await Promise.race([
      page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 20000 }).then(() => true),
      loginError.filter({ hasText: /.+/ }).waitFor({ timeout: 20000 }).then(() => false),
    ]).catch(() => false);

    if (!success) {
      const msg = (await loginError.textContent())?.trim() || 'Sin mensaje';
      const hint = !TEST_USER_EMAIL || !TEST_USER_PASSWORD
        ? ' Comprobá que .env.test existe en la raíz del proyecto y tiene TEST_USER_EMAIL y TEST_USER_PASSWORD (ej: cp .env.test.example .env.test).'
        : ' Revisá que el usuario exista en Supabase, la contraseña sea correcta y que la app esté levantada en ' + (process.env.TEST_BASE_URL || 'http://localhost:5173') + '.';
      throw new Error('Login falló.' + hint + ' Error en pantalla: ' + (msg || '(ninguno)'));
    }

    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#app-content')).toBeVisible({ timeout: 5000 });
  });

  test('tras login, navegación a Panel de Control muestra vista Inicio', async ({ page }) => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
      test.skip(true, 'Faltan TEST_USER_EMAIL o TEST_USER_PASSWORD en .env.test');
    }

    await page.locator('#login-email').fill(TEST_USER_EMAIL);
    await page.locator('#login-password').fill(TEST_USER_PASSWORD);
    await page.locator('#login-form').getByRole('button', { name: /entrar/i }).click();

    const loginError = page.locator('#login-error');
    const success = await Promise.race([
      page.locator('#login-screen').waitFor({ state: 'hidden', timeout: 20000 }).then(() => true),
      loginError.filter({ hasText: /.+/ }).waitFor({ timeout: 20000 }).then(() => false),
    ]).catch(() => false);

    if (!success) {
      const msg = (await loginError.textContent())?.trim() || 'Sin mensaje';
      const hint = !TEST_USER_EMAIL || !TEST_USER_PASSWORD
        ? ' Comprobá que .env.test existe y tiene TEST_USER_EMAIL y TEST_USER_PASSWORD.'
        : ' Revisá usuario/contraseña en Supabase y que la app esté en ' + (process.env.TEST_BASE_URL || 'http://localhost:5173') + '.';
      throw new Error('Login falló.' + hint + ' Error: ' + (msg || '(ninguno)'));
    }

    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 5000 });
    await page.locator('#menu-inicio').click();
    await expect(page.locator('#vista-inicio')).toBeVisible({ timeout: 5000 });
  });
});
