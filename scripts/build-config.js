#!/usr/bin/env node
/**
 * Genera config.js desde variables de entorno (para Vercel u otro deploy).
 * En Vercel: Settings → Environment Variables → SUPABASE_ANON_KEY (y opcional SUPABASE_URL).
 * Build Command: node scripts/build-config.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const content = `// Generado en build desde variables de entorno. No editar a mano en producción.
window.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};
window.SUPABASE_URL = ${JSON.stringify(url)};
${serviceKey ? 'window.SUPABASE_SERVICE_ROLE_KEY = ' + JSON.stringify(serviceKey) + ';' : '// window.SUPABASE_SERVICE_ROLE_KEY no definida.'}
`;

fs.writeFileSync(path.join(root, 'config.js'), content, 'utf8');
console.log('config.js generado en', path.join(root, 'config.js'));
