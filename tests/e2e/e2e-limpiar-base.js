// @ts-check
/**
 * Llamada central a `scripts/limpiar-base-e2e.js` (RPC `limpiar_base_e2e` en Supabase).
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.test (proyecto desarrollo, mismo ref que config.js).
 *
 * Usar al **inicio** de specs que no iteran combinaciones (p. ej. 91) para no heredar
 * órdenes/CC/caja del spec anterior (03 → 91 era el hueco típico).
 */
const path = require('path');
const { execSync } = require('child_process');

/** Lanza si la RPC no pudo ejecutarse (mismas reglas que scripts/limpiar-base-e2e.js). */
function limpiarBaseE2eDesdeTests() {
  const root = path.resolve(__dirname, '../..');
  execSync('node scripts/limpiar-base-e2e.js', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

module.exports = { limpiarBaseE2eDesdeTests };
