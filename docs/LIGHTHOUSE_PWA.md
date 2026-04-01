# Lighthouse (Pandi)

Auditoría local o contra una URL desplegada. En **Lighthouse 12** las categorías CLI son: `performance`, `best-practices`, `accessibility`, `seo`. La categoría **PWA** unificada de versiones viejas ya no existe como bloque separado; muchas comprobaciones relacionadas siguen en **Best practices** o se revisan a mano en DevTools.

## Requisitos

- Node.js ≥ 18 (alineado a `lighthouse` en `package.json`).
- **Chrome** instalado (Lighthouse lanza Chrome en headless).
- Para **preview local**: `config.js` generado (`npm run build` ejecuta `build-config.js`).

## Comandos

### 1. Build + servidor estático (recomendado)

Igual que en producción (sin HMR):

```bash
npm run build
npm run preview
```

Por defecto Vite sirve en **http://127.0.0.1:4173**.

### 2. Generar informe HTML

En **otra terminal**, desde la raíz del repo:

```bash
npm run lighthouse
```

Salida: `docs/lighthouse-report.html` (escritorio).

Versión **móvil** (emulación):

```bash
npm run lighthouse:mobile
```

Salida: `docs/lighthouse-report-mobile.html`.

### URL distinta (preview remoto o producción)

```bash
LIGHTHOUSE_URL=https://pandi.company npm run lighthouse
```

*(Sustituí por tu URL; debe responder 200 sin autenticación en la landing si querés auditar la entrada pública.)*

## Checklist PWA / offline (manual + informe)

| Qué revisar | Dónde |
|-------------|--------|
| Manifest (`name`, `icons` 192/512, `display`, `start_url`, `theme_color`) | Chrome → **Application** → Manifest |
| Service worker registrado y precache | **Application** → Service workers |
| HTTPS en producción | Lighthouse *Best practices* / pestaña Security |
| Instalable (cuando aplique) | **Application** → Manifest + prueba “Install” en Chrome/Android |
| Offline / caché | Prueba manual en avión o DevTools → Network → Offline |

## Archivos generados

Los informes `docs/lighthouse-report.html` y `docs/lighthouse-report-mobile.html` están en **.gitignore** (no se versionan). Compartilos si hace falta pegando el HTML o subiendo el archivo a un ticket.

## Referencia

- Plan y estado offline/PWA: `docs/PLAN_PWA_OPERACION_OFFLINE.md` (v2).
- Detalle técnico (claves IDB, TTL, flush): `docs/PWA_OFFLINE_TECNICO.md`.
- Guía usuario (también en `manual_usuario.pdf`): `docs/MANUAL_USUARIO_OFFLINE.md`.
- [Lighthouse documentation](https://developer.chrome.com/docs/lighthouse/overview/)
