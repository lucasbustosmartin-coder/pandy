# Git y Vercel – Pandi

Para tener el repo en GitHub y la app desplegada en Vercel (redeploy automático en cada push a `main`).

---

## 1. Git: crear repo y conectar

Desde la **raíz de Pandi**:

```bash
cd "/Users/lucasb/Escritorio - MacBook Air de Lucas/Pandi"
git init
```

Creá un repositorio en GitHub (nombre sugerido: `pandi`), sin README si ya tenés archivos. Luego:

```bash
git remote add origin https://github.com/TU_USUARIO/pandi.git
git add .
git commit -m "Setup: estructura, reglas, bitácora"
git branch -M main
git push -u origin main
```

---

## 2. Actualizar bitácora con URLs reales

Cuando tengas la URL del repo y la de Vercel, editá en `scripts/crear-bitacora-excel.js` el array `refGitVercel` (Repositorio GitHub y URL app en vivo). Luego: `node scripts/crear-bitacora-excel.js` y commit.

---

## 3. Vercel: conectar y desplegar

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → importar el repo `pandi`.
2. Configuración:
   - **Build Command:** `node scripts/build-config.js`
   - **Output Directory:** `.`
   - **Rewrites:** ya definidos en `vercel.json` (raíz → `/index.html`).

### Variables de entorno en Vercel

En **Settings** → **Environment Variables** del proyecto:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_ANON_KEY`: anon public key.

Opcional: `SUPABASE_SERVICE_ROLE_KEY` solo si la app en producción necesita operaciones con service role (usar con cuidado).

Así `config.js` se genera en el build y la app no queda en blanco por falta de config.

---

## 4. Despliegue manual

Después de push a `main`, desde la raíz:

```bash
vercel --prod
```

O configurá en Vercel el redeploy automático al hacer push a `main`.
