# Rama `preview-pwa-fase1` — pruebas PWA (Fase 1)

## Qué cambia respecto de `main`

- **Build en Vercel:** `node scripts/build-config.js && vite build` y **salida `dist/`** (antes: solo `build-config` y raíz del repo).
- **PWA:** `vite-plugin-pwa` genera `manifest.webmanifest`, `sw.js` y precache del shell; en `main.js` se registra la actualización con `showConfirm` / `showToast`.
- **Icono 512:** `assets/pwa-icon-512.png` (generado desde el favicon 192; no hace falta regenerar salvo que cambie el logo).

## Cómo probar en Vercel sin tocar producción

1. Subí la rama y esperá el **deployment Preview** (URL con hash `*.vercel.app`).
2. Abrí esa URL en Chrome o Edge → **Instalar** / **Añadir a pantalla de inicio**.
3. **Offline:** entrá una vez con red, luego activá modo avión y recargá: debería cargarse la interfaz desde caché (los datos siguen yendo a Supabase con red).

**Producción (`pandi.company`)** no usa esta rama hasta que hagas **merge** a `main` y despliegues.

## Comandos locales

```bash
npm run build    # genera config.js + dist/ (no subir dist/ al git)
npm run preview  # sirve dist en http://localhost:4173
npm run dev      # desarrollo con Vite (puerto 5173)
```

## Notas

- `assets/Dolar.png` (~4,7 MB) **no** entra al precache del SW (evita superar límites de Workbox).
- El aviso *`<script src="/config.js">` can't be bundled* en el build es esperable: `config.js` se copia a `dist/` en el paso `closeBundle` del `vite.config.js`.
