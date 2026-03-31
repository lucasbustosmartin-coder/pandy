#!/usr/bin/env node
/**
 * Genera variantes "dev" del favicon: mismo arte que prod (favicon-192x192.png)
 * sobre fondo celeste sólido, sin deformar (composición 192×192).
 * Salida: favicon-192x192-dev.png, favicon-32x32-dev.png, favicon-16x16-dev.png
 */
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const srcPng = path.join(root, 'assets', 'favicon-192x192.png');
/** Celeste claro (sky-200) — fondo detrás del PNG con transparencia */
const BG = { r: 186, g: 230, b: 253, alpha: 1 };

async function main() {
  const baseBuf = await sharp(srcPng).ensureAlpha().toBuffer();
  const meta = await sharp(baseBuf).metadata();
  if (meta.width !== 192 || meta.height !== 192) {
    console.warn(
      'Advertencia: se esperaba 192×192 en favicon-192x192.png; actual:',
      meta.width,
      '×',
      meta.height,
    );
  }

  const composed192 = await sharp({
    create: { width: 192, height: 192, channels: 4, background: BG },
  })
    .composite([{ input: baseBuf, gravity: 'center' }])
    .png()
    .toBuffer();

  const out192 = path.join(root, 'assets', 'favicon-192x192-dev.png');
  const out32 = path.join(root, 'assets', 'favicon-32x32-dev.png');
  const out16 = path.join(root, 'assets', 'favicon-16x16-dev.png');

  await sharp(composed192).png().toFile(out192);
  await sharp(composed192).resize(32, 32).png().toFile(out32);
  await sharp(composed192).resize(16, 16).png().toFile(out16);

  console.log('OK:', path.relative(root, out192), path.relative(root, out32), path.relative(root, out16));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
