#!/usr/bin/env node
/**
 * Genera docs/PANDI_INSTALAR_MOVIL.pdf desde docs/PANDI_INSTALAR_MOVIL.html (Playwright + Chromium).
 * Las imágenes usan rutas relativas ../assets/ respecto del HTML; file:// debe resolver bien.
 *
 * Uso (desde la raíz del repo): npm run docs:pdf:instalar-movil
 * Requisito: npx playwright install chromium (una vez)
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'PANDI_INSTALAR_MOVIL.html');
const pdfPath = path.join(root, 'docs', 'PANDI_INSTALAR_MOVIL.pdf');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(htmlPath)) {
    console.error('No existe:', htmlPath);
    process.exit(1);
  }
  const fileUrl = pathToFileURL(htmlPath).href;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#64748b;padding:0 14mm;font-family:system-ui,sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span> · Pandi — Instalación móvil</div>',
    });
    console.log('PDF creado:', pdfPath);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
