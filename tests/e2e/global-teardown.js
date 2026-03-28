/**
 * Tras todo el suite E2E: por defecto NO limpia la base, para poder revisar la app / Supabase a mano.
 * Limpieza post-suite solo si definís E2E_LIMPIAR_AL_FINAL=1 (p. ej. CI que quiera dejar el proyecto vacío).
 */
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  if (process.env.E2E_LIMPIAR_AL_FINAL !== '1') {
    console.log(
      'global-teardown: sin limpieza (revisá CC/órdenes en la app). Para truncar al terminar: E2E_LIMPIAR_AL_FINAL=1 npx playwright test …'
    );
    return;
  }
  const root = path.resolve(__dirname, '../..');
  try {
    execSync('node scripts/limpiar-base-e2e.js', {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
  } catch (e) {
    console.warn('global-teardown: limpieza post-suite falló (¿credenciales en .env.test?).');
  }
};
