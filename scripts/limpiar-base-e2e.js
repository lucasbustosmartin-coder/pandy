/**
 * Limpia la base para tests E2E (solo desarrollo).
 * 1) Borra clientes e intermediarios creados por los tests (RPC: E2E % clientes; intermediarios E2E Int % o E2E CC TiposActivos Int).
 * 2) Trunca órdenes, transacciones, instrumentación, movimientos CC y caja; resetea secuencias.
 *
 * Requiere en .env.test (o .env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Ejecutar en Supabase SQL Editor una vez: sql/rpc_limpiar_base_e2e.sql
 *
 * Uso: node scripts/limpiar-base-e2e.js
 * El test E2E puede invocarlo en globalSetup o beforeAll.
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
  console.warn('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.test o .env. No se ejecuta limpieza.');
  process.exit(0);
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
