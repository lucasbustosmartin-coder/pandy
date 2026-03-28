/**
 * Lee docs/Pandy_Dev_Supabase.xlsx (primera hoja, fila 1 = encabezados, fila 2 = valores)
 * y escribe .env y config.js en la raíz (archivos en .gitignore).
 *
 * Encabezados esperados (mayúsculas/minúsculas flexibles):
 *   Proyecto | Pass_DB | Project URL | Publishable key | anon public | service_role
 *
 * Uso: node scripts/volcar-pandy-dev-supabase.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'docs', 'Pandy_Dev_Supabase.xlsx');
const ENV_PATH = path.join(ROOT, '.env');
const CONFIG_PATH = path.join(ROOT, 'config.js');

function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Si la URL es solo el ref (sin dominio), completa .supabase.co */
function normalizeSupabaseUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return u;
  u = u.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname;
    if (host && !host.includes('.') && host.length > 0) {
      return `https://${host}.supabase.co`;
    }
    return u.replace(/\/$/, '');
  } catch {
    return u.replace(/\/$/, '');
  }
}

function pick(row, ...aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const want = normKey(alias);
    for (const k of keys) {
      if (normKey(k) === want) return String(row[k] ?? '').trim();
    }
  }
  for (const alias of aliases) {
    const want = normKey(alias);
    for (const k of keys) {
      if (normKey(k).includes(want) || want.includes(normKey(k))) return String(row[k] ?? '').trim();
    }
  }
  return '';
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('No existe:', XLSX_PATH);
    console.error('Colocá el Excel en docs/Pandy_Dev_Supabase.xlsx y volvé a ejecutar:');
    console.error('  node scripts/volcar-pandy-dev-supabase.js');
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) {
    console.error('La hoja está vacía o no tiene filas de datos.');
    process.exit(1);
  }

  const row = rows[0];
  const proyecto = pick(row, 'proyecto');
  const passDb = pick(row, 'pass_db', 'pass db', 'database password');
  const urlRaw = pick(row, 'project url', 'url', 'supabase url');
  const publishable = pick(row, 'publishable key', 'publishable');
  const anon = pick(row, 'anon public', 'anon', 'anon key');
  const service = pick(row, 'service_role', 'service role', 'service');

  const url = normalizeSupabaseUrl(urlRaw);
  if (!url || !anon) {
    console.error('Faltan Project URL o anon public en el Excel. Revisá encabezados y la primera fila de datos.');
    console.error('Claves leídas:', Object.keys(row).join(', '));
    process.exit(1);
  }

  const envLines = [
    '# Pandy-Dev (generado por scripts/volcar-pandy-dev-supabase.js — no subir a git)',
    `SUPABASE_URL=${url}`,
    `SUPABASE_ANON_KEY=${anon}`,
    service ? `SUPABASE_SERVICE_ROLE_KEY=${service}` : '# SUPABASE_SERVICE_ROLE_KEY=',
    passDb ? `SUPABASE_DB_PASSWORD=${passDb}` : '# SUPABASE_DB_PASSWORD=',
    publishable ? `# Publishable (referencia; el front usa anon): ${publishable}` : '',
    proyecto ? `# Proyecto: ${proyecto}` : '',
    '',
  ].filter(Boolean);

  fs.writeFileSync(ENV_PATH, envLines.join('\n'), 'utf8');
  console.log('Escrito:', ENV_PATH);

  const configBody = `// Generado por scripts/volcar-pandy-dev-supabase.js — no subir (config.js está en .gitignore)
window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(anon)};

// Opcional: scripts locales / tests con service role (no usar en el navegador expuesto)
// window.SUPABASE_SERVICE_ROLE_KEY = ${service ? JSON.stringify(service) : "''"};
`;

  fs.writeFileSync(CONFIG_PATH, configBody, 'utf8');
  console.log('Escrito:', CONFIG_PATH);
  console.log('Listo. Levantá la app con: npm run dev');
}

main();
