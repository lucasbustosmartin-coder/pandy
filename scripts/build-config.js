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
/** Preview Vercel o build local con PANDI_DEV_ICON=1 → icono 192 panda celeste (diferenciar de prod). */
const vercelEnv = process.env.VERCEL_ENV || '';
const useDevIcon =
  vercelEnv === 'preview' || String(process.env.PANDI_DEV_ICON || '').trim() === '1';
const icon192Default = useDevIcon ? '/assets/favicon-192x192-dev.png' : '/assets/favicon-192x192.png';
const icon32Default = useDevIcon ? '/assets/favicon-32x32-dev.png' : '/assets/favicon-32x32.png';
const icon16Default = useDevIcon ? '/assets/favicon-16x16-dev.png' : '/assets/favicon-16x16.png';

const content = `// Generado en build desde variables de entorno. No editar a mano en producción.
window.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};
window.SUPABASE_URL = ${JSON.stringify(url)};
window.PANDI_ICON_192_DEFAULT = ${JSON.stringify(icon192Default)};
window.PANDI_FAVICON_32_DEFAULT = ${JSON.stringify(icon32Default)};
window.PANDI_FAVICON_16_DEFAULT = ${JSON.stringify(icon16Default)};
${serviceKey ? 'window.SUPABASE_SERVICE_ROLE_KEY = ' + JSON.stringify(serviceKey) + ';' : '// window.SUPABASE_SERVICE_ROLE_KEY no definida.'}
`;

fs.writeFileSync(path.join(root, 'config.js'), content, 'utf8');
console.log(
  'config.js generado en',
  path.join(root, 'config.js'),
  '| iconos:',
  icon192Default,
  icon32Default,
  icon16Default,
);
