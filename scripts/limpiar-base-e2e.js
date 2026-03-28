/**
 * Limpia la base para tests E2E (solo desarrollo).
 * La RPC trunca primero (órdenes, transacciones, CC, caja, etc.) y luego borra clientes/intermediarios E2E
 * (mismo orden que truncar_ordenes_transacciones.sql + DELETE opcional al final).
 *
 * Requiere en .env.test (o .env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY del proyecto de DESARROLLO
 * (mismas que config.js / .env tras volcar Pandy-Dev; nunca producción).
 * Sin ellas termina con código 1. Para omitir a propio riesgo: E2E_SKIP_LIMPIAR_BASE=1.
 * Ejecutar en Supabase SQL Editor una vez: sql/rpc_limpiar_base_e2e.sql
 *
 * Uso: node scripts/limpiar-base-e2e.js
 * Invocación: Playwright globalSetup/globalTeardown, cada combinación en 01/02/03, cada test en 91-orden-cc (tests/e2e/e2e-limpiar-base.js).
 */
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.test') });
require('dotenv').config({ path: path.join(root, '.env') });

let url = process.env.SUPABASE_URL || '';
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Si faltan, intentar leer de config.js (mismo proyecto, no subido al repo)
if (!url || !serviceKey) {
  const configPath = path.join(root, 'config.js');
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const mUrl = configContent.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const mKey = configContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (mUrl) url = url || mUrl[1];
    if (mKey) serviceKey = serviceKey || mKey[1];
  }
}

if (!url || !serviceKey) {
  if (process.env.E2E_SKIP_LIMPIAR_BASE === '1') {
    console.warn('E2E_SKIP_LIMPIAR_BASE=1: omitiendo limpieza (faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(0);
  }
  console.error(
    'limpiar-base-e2e: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.test o .env. ' +
      'Sin la RPC la base no se limpia entre tests. Completá las variables o usá E2E_SKIP_LIMPIAR_BASE=1 para omitir.'
  );
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const client = createClient(url, serviceKey);

(async () => {
  const { error } = await client.rpc('limpiar_base_e2e');
  if (error) {
    console.error('Error al limpiar base E2E:', error.message);
    process.exit(1);
  }
  console.log('Base limpiada para E2E (clientes/intermediarios E2E borrados, órdenes/transacciones truncadas).');
})();
