/**
 * Se ejecuta una vez antes de todos los tests E2E.
 * Invoca scripts/limpiar-base-e2e.js (RPC en Supabase). Falla el suite si faltan SUPABASE_* (salvo E2E_SKIP_LIMPIAR_BASE=1).
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  // E2E APAGADOS (2026-11-20, decisión del titular): están desactualizados y vacían la base de dev.
  // Las pruebas funcionales las hace el subagente .claude/agents/pandi-tester.md en dev, sin borrar datos.
  // Para correrlos igual (a propio riesgo): E2E_HABILITADO=1.
  if (process.env.E2E_HABILITADO !== '1') {
    throw new Error('E2E deshabilitados: usar el agente pandi-tester (ver CLAUDE.md). Para forzar: E2E_HABILITADO=1.');
  }
  const root = path.resolve(__dirname, '../..');
  execSync('node scripts/limpiar-base-e2e.js', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
};
