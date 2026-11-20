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
const root = path.resolve(__dirname, '..');
// Solo .env.test (credenciales E2E de desarrollo). No se leen .env ni config.js como respaldo (2026-11-20).
require('dotenv').config({ path: path.join(root, '.env.test') });

const PANDI_REF_PRODUCCION = 'bxwxuzbahewvptarlnxm';
const E2E_REF_PERMITIDO = process.env.E2E_ALLOWED_SUPABASE_REF || 'ozsofsmnuzliczfphqze'; // Pandy-Dev

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  if (process.env.E2E_SKIP_LIMPIAR_BASE === '1') {
    console.warn('E2E_SKIP_LIMPIAR_BASE=1: omitiendo limpieza (faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(0);
  }
  console.error(
    'limpiar-base-e2e: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.test. ' +
      'Sin la RPC la base no se limpia entre tests. Completá las variables o usá E2E_SKIP_LIMPIAR_BASE=1 para omitir.'
  );
  process.exit(1);
}

let ref = '';
try {
  ref = new URL(url).hostname.split('.')[0];
} catch (_e) {
  ref = '';
}
if (!ref || ref === PANDI_REF_PRODUCCION || ref !== E2E_REF_PERMITIDO) {
  console.error(
    'limpiar-base-e2e: BLOQUEADO. SUPABASE_URL apunta a "' + (ref || '?') + '" y solo se permite el proyecto de desarrollo "' +
      E2E_REF_PERMITIDO + '" (nunca producción). Revisá .env.test.'
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
