import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

const isDevIconPwa =
  process.env.VERCEL_ENV === 'preview' || String(process.env.PANDI_DEV_ICON || '').trim() === '1';
const pwaIcon192Src = isDevIconPwa ? '/assets/favicon-192x192-dev.png' : '/assets/favicon-192x192.png';
const pwaIcon512Src = isDevIconPwa ? '/assets/pwa-icon-512-dev.png' : '/assets/pwa-icon-512.png';
/** Raíz sin query string: iOS/Safari a veces no aplica ?v= en apple-touch y probá /apple-touch-icon.png antes que el HTML. */
const appleTouchRootHref = '/apple-touch-icon.png';

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

export default defineConfig({
  esbuild: {
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'js',
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'assets/favicon-16x16.png',
        'assets/favicon-16x16-dev.png',
        'assets/favicon-32x32.png',
        'assets/favicon-32x32-dev.png',
        'assets/favicon-192x192.png',
        'assets/favicon-192x192-dev.png',
        'assets/pwa-icon-512.png',
        'assets/pwa-icon-512-dev.png',
        'assets/apple-touch-icon-180.png',
        'assets/apple-touch-icon-180-dev.png',
      ],
      manifest: {
        name: 'Pandi',
        short_name: 'Pandi',
        description: 'Órdenes, cuenta corriente y caja',
        theme_color: '#0d2137',
        background_color: '#f5f5f5',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        lang: 'es',
        icons: [
          {
            src: appleTouchRootHref,
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: pwaIcon192Src,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: pwaIcon512Src,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: pwaIcon512Src,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif}'],
        globIgnores: ['**/Dolar.png', '**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          /** Novedades de versión: siempre red (el bundle JS puede estar viejo por el SW; el JSON trae el texto del despliegue actual). */
          {
            urlPattern: /^https?:\/\/[^/]+\/pandi-release\.json$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pandi-jsdelivr',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    {
      name: 'pandi-apple-touch-static',
      transformIndexHtml(html) {
        // Varias entradas: iOS a veces ignora solo `sizes` o solo la ruta canónica; la «P» es el fallback
        // cuando ningún PNG válido llega (caché vieja, preview con protección Vercel 401, etc.).
        const links = [
          `  <link rel="apple-touch-icon" href="${appleTouchRootHref}" />`,
          `  <link rel="apple-touch-icon" sizes="180x180" href="${appleTouchRootHref}" />`,
          `  <link rel="apple-touch-icon" sizes="192x192" href="${pwaIcon192Src}" />`,
        ].join('\n');
        if (!html.includes('<!--pandi-apple-touch-icon-->')) {
          console.warn('[pandi-apple-touch-static] placeholder faltante en index.html');
          return html;
        }
        return html.replace('<!--pandi-apple-touch-icon-->', links);
      },
    },
    {
      name: 'copy-assets-and-config',
      async closeBundle() {
        const dist = path.join(__dirname, 'dist');
        copyDirSync(path.join(__dirname, 'assets'), path.join(dist, 'assets'));
        const cfg = path.join(__dirname, 'config.js');
        if (fs.existsSync(cfg)) {
          fs.copyFileSync(cfg, path.join(dist, 'config.js'));
        }
        const touchSrc = path.join(
          __dirname,
          'assets',
          isDevIconPwa ? 'apple-touch-icon-180-dev.png' : 'apple-touch-icon-180.png',
        );
        const touchDest = path.join(dist, 'apple-touch-icon.png');
        if (fs.existsSync(touchSrc)) {
          fs.copyFileSync(touchSrc, touchDest);
        } else {
          console.warn('[copy-assets] Falta', touchSrc, '— ejecutá npm run assets:dev-favicon');
        }
        try {
          const blurHref = pathToFileURL(path.join(__dirname, 'pandi-release-blurb.js')).href;
          const mod = await import(`${blurHref}?t=${Date.now()}`);
          if (mod.PANDI_RELEASE_BLURB) {
            fs.writeFileSync(
              path.join(dist, 'pandi-release.json'),
              JSON.stringify(mod.PANDI_RELEASE_BLURB),
            );
          }
        } catch (e) {
          console.warn('[pandi-release.json]', e && e.message ? e.message : e);
        }
      },
    },
  ],
});
