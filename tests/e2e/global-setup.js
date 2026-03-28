/**
 * Se ejecuta una vez antes de todos los tests E2E.
 * Invoca scripts/limpiar-base-e2e.js (RPC en Supabase). Falla el suite si faltan SUPABASE_* (salvo E2E_SKIP_LIMPIAR_BASE=1).
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const root = path.resolve(__dirname, '../..');
  execSync('node scripts/limpiar-base-e2e.js', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
};
