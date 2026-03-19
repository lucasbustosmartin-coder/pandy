/**
 * Se ejecuta una vez antes de todos los tests E2E.
 * Limpia la base (clientes/intermediarios E2E + truncate órdenes/transacciones)
 * para no acumular suciedad en desarrollo.
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const root = path.resolve(__dirname, '../..');
  try {
    execSync('node scripts/limpiar-base-e2e.js', {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
  } catch (e) {
    if (e.status === 0) return;
    console.warn('global-setup: limpiar-base-e2e no se ejecutó o falló (¿faltan SUPABASE_URL/SERVICE_ROLE_KEY en .env.test?). Los tests pueden correr igual.');
  }
};
