#!/usr/bin/env node
/**
 * Genera variantes "dev" del favicon: mismo arte que prod (favicon-192x192.png)
 * sobre fondo celeste. El PNG de prod suele ser RGB con blanco opaco; un simple
 * composite no muestra el celeste. Se hace flood-fill desde los bordes: píxeles
 * blancos conectados al borde → transparente; la cara blanca del panda queda
 * rodeada por trazo oscuro y no se pierde.
 * Salidas: 192/32/16 dev + pwa-icon-512-dev.png + apple-touch-icon-180-dev.png (y prod apple-touch-icon-180.png desde el PNG base).
 */
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const srcPng = path.join(root, 'assets', 'favicon-192x192.png');
/** Celeste claro (sky-200) */
const BG = { r: 186, g: 230, b: 253, alpha: 1 };

/**
 * Desde todos los píxeles del borde que son "casi blancos", marca transparente
 * todo lo 4-conectado igual (solo exterior típico de iconos centrados).
 * @param {Buffer} data - RGBA raw, se muta
 * @param {number} w
 * @param {number} h
 * @param {number} thr - r,g,b >= thr se consideran fondo
 */
function floodEdgeNearWhiteTransparent(data, w, h, thr = 248) {
  const inBg = (i) => data[i] >= thr && data[i + 1] >= thr && data[i + 2] >= thr;
  const seen = new Uint8Array(w * h);
  const q = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!inBg(i)) return;
    seen[idx] = 1;
    q.push(idx);
  };
  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const idx = q[qi];
    const i = idx * 4;
    data[i + 3] = 0;
    const x = idx % w;
    const y = (idx / w) | 0;
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nidx = ny * w + nx;
      if (seen[nidx]) continue;
      const ni = nidx * 4;
      if (!inBg(ni)) continue;
      seen[nidx] = 1;
      q.push(nidx);
    }
  }
}

async function main() {
  const { data, info } = await sharp(srcPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  if (info.channels !== 4) {
    throw new Error(`Se esperaban 4 canales RGBA, hay ${info.channels}`);
  }

  const pix = Buffer.from(data);
  floodEdgeNearWhiteTransparent(pix, w, h, 248);

  const cutout = await sharp(pix, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  const composed192 = await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: cutout, gravity: 'center' }])
    .png()
    .toBuffer();

  const out192 = path.join(root, 'assets', 'favicon-192x192-dev.png');
  const out32 = path.join(root, 'assets', 'favicon-32x32-dev.png');
  const out16 = path.join(root, 'assets', 'favicon-16x16-dev.png');
  const out512 = path.join(root, 'assets', 'pwa-icon-512-dev.png');
  const out180Dev = path.join(root, 'assets', 'apple-touch-icon-180-dev.png');
  const out180Prod = path.join(root, 'assets', 'apple-touch-icon-180.png');

  await sharp(composed192).png().toFile(out192);
  await sharp(composed192).resize(32, 32).png().toFile(out32);
  await sharp(composed192).resize(16, 16).png().toFile(out16);
  await sharp(composed192).resize(512, 512).png().toFile(out512);
  await sharp(composed192).resize(180, 180).png().toFile(out180Dev);
  await sharp(srcPng).resize(180, 180).png().toFile(out180Prod);

  console.log(
    'OK:',
    path.relative(root, out192),
    path.relative(root, out32),
    path.relative(root, out16),
    path.relative(root, out512),
    path.relative(root, out180Dev),
    path.relative(root, out180Prod),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
