#!/usr/bin/env node
/**
 * Quita fondo claro (típico blanco/gris de estudio) de los iconos de moneda y cheque.
 * Usa inundación desde el borde: solo píxeles conectados al exterior y "claros" pasan a alpha 0.
 * Así no se agujerea el interior de símbolos claros desconectados del borde.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/quitar-fondo-blanco-iconos.js
 *   node scripts/quitar-fondo-blanco-iconos.js --dry-run
 *   node scripts/quitar-fondo-blanco-iconos.js --lum-min=200 --sat-max=45 --dist=900
 *
 * Requisito: npm i (sharp en devDependencies).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

const DEFAULT_FILES = [
  'Icono_Dolar.avif',
  'Icono_Euro.avif',
  'Icono_ARS.webp',
  'Icono_Cheques.png',
];

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { dryRun: false, lumMin: 218, satMax: 38, distWhiteSq: 1800 };
  for (const x of a) {
    if (x === '--dry-run' || x === '-n') out.dryRun = true;
    else if (x.startsWith('--lum-min=')) out.lumMin = Number(x.split('=')[1]);
    else if (x.startsWith('--sat-max=')) out.satMax = Number(x.split('=')[1]);
    else if (x.startsWith('--dist=')) out.distWhiteSq = Number(x.split('=')[1]);
  }
  return out;
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** ¿Puede ser "fondo" según brillo / poca saturación / cercanía al blanco? */
function isCandidateBackground(r, g, b, opts) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC - minC;
  const lum = luminance(r, g, b);
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  const distWhite = dr * dr + dg * dg + db * db;
  if (distWhite <= opts.distWhiteSq) return true;
  if (lum >= opts.lumMin && sat <= opts.satMax) return true;
  return false;
}

/**
 * Marca píxeles de fondo: flood fill 4-vecinos desde todos los bordos,
 * solo expande por píxeles que cumplan isCandidateBackground.
 */
function floodBackgroundMask(data, width, height, opts) {
  const n = width * height;
  const mask = new Uint8Array(n);
  const stack = [];

  function pushIf(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const p = y * width + x;
    if (mask[p]) return;
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!isCandidateBackground(r, g, b, opts)) return;
    mask[p] = 1;
    stack.push(p);
  }

  for (let x = 0; x < width; x++) {
    pushIf(x, 0);
    pushIf(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIf(0, y);
    pushIf(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p / width) | 0;
    if (x + 1 < width) pushIf(x + 1, y);
    if (x - 1 >= 0) pushIf(x - 1, y);
    if (y + 1 < height) pushIf(x, y + 1);
    if (y - 1 >= 0) pushIf(x, y - 1);
  }

  return mask;
}

function applyMaskToAlpha(data, mask, width, height) {
  const n = width * height;
  for (let p = 0; p < n; p++) {
    if (!mask[p]) continue;
    data[p * 4 + 3] = 0;
  }
}

async function encodeRawRgba(data, width, height, ext) {
  const input = sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 },
  }).ensureAlpha();

  if (ext === '.avif') {
    return input.avif({ quality: 72, effort: 7, chromaSubsampling: '4:4:4' }).toBuffer();
  }
  if (ext === '.webp') {
    return input.webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  }
  if (ext === '.png') {
    return input.png({ compressionLevel: 9, effort: 10 }).toBuffer();
  }
  return input.png().toBuffer();
}

async function processOne(filePath, opts) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Se esperaban 4 canales (RGBA), hay ${info.channels}: ${filePath}`);
  }

  const w = info.width;
  const h = info.height;
  const copy = Buffer.from(data);
  const mask = floodBackgroundMask(copy, w, h, opts);
  applyMaskToAlpha(copy, mask, w, h);

  const out = await encodeRawRgba(copy, w, h, ext);
  return out;
}

async function main() {
  const opts = parseArgs();
  console.log('Parámetros:', opts);

  for (const name of DEFAULT_FILES) {
    const filePath = path.join(ASSETS_DIR, name);
    if (!fs.existsSync(filePath)) {
      console.warn('Omitido (no existe):', filePath);
      continue;
    }
    const before = fs.statSync(filePath).size;
    const outBuf = await processOne(filePath, opts);
    const after = outBuf.length;
    console.log(`${name}: ${before} → ${after} bytes`);
    if (!opts.dryRun) {
      fs.writeFileSync(filePath, outBuf);
      console.log(`  Escrito: ${filePath}`);
    } else {
      console.log('  (dry-run, no se escribió)');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
