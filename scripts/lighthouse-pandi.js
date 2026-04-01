/**
 * Ejecuta Lighthouse contra una URL (build local preview o producción).
 * Uso:
 *   npm run build && npm run preview
 *   npm run lighthouse
 *
 * URL por defecto: http://127.0.0.1:4173 (vite preview).
 * Override: LIGHTHOUSE_URL=https://tu-dominio.com npm run lighthouse
 *
 * Lighthouse 12+ ya no expone categoría "pwa" aparte; manifest / SW / installability
 * conviene revisarlos en Chrome → DevTools → Application y en el informe (auditorías sueltas).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const lighthouseCli = path.join(root, 'node_modules', 'lighthouse', 'cli', 'index.js');

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const urlArg = args.find((a) => /^https?:\/\//i.test(a));
const url = urlArg || process.env.LIGHTHOUSE_URL || 'http://127.0.0.1:4173';

const outName = mobile ? 'lighthouse-report-mobile.html' : 'lighthouse-report.html';
const outPath = path.join(root, 'docs', outName);

const categories = ['performance', 'best-practices', 'accessibility', 'seo'];

const lhArgs = [
  lighthouseCli,
  url,
  '--quiet',
  `--only-categories=${categories.join(',')}`,
  '--output=html',
  `--output-path=${outPath}`,
  '--chrome-flags=--headless=new',
];

if (mobile) {
  lhArgs.push('--form-factor=mobile');
} else {
  lhArgs.push('--preset=desktop');
}

const r = spawnSync(process.execPath, lhArgs, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

if (r.status !== 0) {
  process.exit(r.status === null ? 1 : r.status);
}
console.log('\nInforme HTML:', outPath);
