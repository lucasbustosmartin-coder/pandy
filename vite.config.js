import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

const isDevIconPwa =
  process.env.VERCEL_ENV === 'preview' || String(process.env.PANDI_DEV_ICON || '').trim() === '1';
const pwaIcon192Src = isDevIconPwa ? '/assets/favicon-192x192-dev.png' : '/assets/favicon-192x192.png';

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
            src: pwaIcon192Src,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/pwa-icon-512.png',
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
      name: 'copy-assets-and-config',
      closeBundle() {
        const dist = path.join(__dirname, 'dist');
        copyDirSync(path.join(__dirname, 'assets'), path.join(dist, 'assets'));
        const cfg = path.join(__dirname, 'config.js');
        if (fs.existsSync(cfg)) {
          fs.copyFileSync(cfg, path.join(dist, 'config.js'));
        }
      },
    },
  ],
});
