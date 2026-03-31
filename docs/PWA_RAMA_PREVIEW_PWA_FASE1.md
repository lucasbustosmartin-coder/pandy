# Rama `preview-pwa-fase1` — pruebas PWA (Fase 1)

## Qué cambia respecto de `main`

- **Build en Vercel:** `node scripts/build-config.js && vite build` y **salida `dist/`** (antes: solo `build-config` y raíz del repo).
- **PWA:** `vite-plugin-pwa` genera `manifest.webmanifest`, `sw.js` y precache del shell; en `main.js` se registra la actualización con `showConfirm` / `showToast`.
- **Icono 512:** `assets/pwa-icon-512.png` (generado desde el favicon 192; no hace falta regenerar salvo que cambie el logo).

## Cómo probar en Vercel sin tocar producción

### URL fija `preview.pandi.company` (recomendado mientras probás PWA)

Ese dominio sigue la rama Git **`preview-empleado`** (no se configura en el repo). Para **no usar la URL con hash** en cada push, se fusionó **`preview-pwa-fase1` → `preview-empleado`** y se hizo push: cada push a **`preview-pwa-fase1`** seguí haciendo merge rápido a **`preview-empleado`** (o trabajá directo en `preview-empleado` si preferís), y **preview.pandi.company** se actualizará con el último deploy de esa rama.

**Cuando termines las pruebas PWA**, volvé a alinear `preview-empleado` con `main` (mismo criterio que `docs/GIT_Y_VERCEL.md` §4c), por ejemplo:

```bash
git checkout preview-empleado
git pull origin preview-empleado
git merge main -m "sync: preview-empleado con main (post pruebas PWA)"
git push origin preview-empleado
```

*(Si `main` aún no tiene PWA, esto “saca” la PWA del preview estable hasta que merges a `main`.)*

### URL con hash (`*.vercel.app`)

Cada push a una rama genera un deployment Preview; la URL con hash sirve para comparar sin tocar `preview-empleado`.

### Qué hacer en el teléfono

1. Abrí **https://preview.pandi.company** (tras el deploy de Vercel, ~1–2 min).
2. **Instalar** / **Añadir a pantalla de inicio**.
3. **Offline:** una visita con red y luego modo avión + recargar: interfaz desde caché; datos vivos necesitan red.

**Producción (`pandi.company`)** no cambia hasta **merge** a **`main`** y deploy de producción.

## Comandos locales

```bash
npm run build    # genera config.js + dist/ (no subir dist/ al git)
npm run preview  # sirve dist en http://localhost:4173
npm run dev      # desarrollo con Vite (puerto 5173)
```

## Notas

- `assets/Dolar.png` (~4,7 MB) **no** entra al precache del SW (evita superar límites de Workbox).
- El aviso *`<script src="/config.js">` can't be bundled* en el build es esperable: `config.js` se copia a `dist/` en el paso `closeBundle` del `vite.config.js`.
