# Desarrollo local (sin desplegar a Vercel)

Objetivo: levantar la app en tu máquina con **un solo proyecto Supabase de desarrollo**, regenerando `config.js` desde variables de entorno para no editarlo a mano en cada cambio.

## Requisitos

- Node.js y `npm install` en la raíz del repo.
- Proyecto **Supabase dev** (no producción): URL + **anon public** como mínimo.

## Aviso: `.env.local` y Vercel CLI

Si corrés **`vercel env pull`** o el CLI creó **`.env.local`**, ese archivo puede traer **`SUPABASE_URL`** y **`SUPABASE_ANON_KEY` de producción**. En este repo, `build-config.js` carga **`.env.local` después de `.env` y pisa las claves** → `npm run dev` termina apuntando a **prod** aunque **`.env`** sea Pandy-Dev.

**Solución:** en local, **no** dejes `SUPABASE_*` en `.env.local` (solo token u otras vars de Vercel si las necesitás), o borrá `.env.local` y usá solo `.env`.

**`.env.production` / `.env.preview`:** si **`vercel env pull`** creó esos archivos, **no los commitees** (están en `.gitignore`). Suelen traer `SUPABASE_ANON_KEY` y a veces tokens de Vercel; si llegaron a subirse al repo, **rotá** claves afectadas y limpiá historial si hace falta (ver `docs/SEGURIDAD_CHECKLIST_GITHUB_VERCEL_SUPABASE.md`).

## Opción A — `.env` (recomendada)

1. Copiá el ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Editá `.env` y completá `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Supabase → **Settings** → **API**).
3. Opcional: `SUPABASE_SERVICE_ROLE_KEY` si corrés scripts o tests que la necesiten.
4. Opcional: `PANDI_DEV_ICON=1` para favicon/iconos “dev” (celeste), como el Preview en Vercel.
5. Levantá la app:
   ```bash
   npm run dev
   ```

`npm run dev` ejecuta antes `node scripts/build-config.js`, que lee **`.env`** y luego **`.env.local`** (si existe; pisa claves de `.env`). Eso genera **`config.js`** en la raíz (ignorado por Git), que Vite sirve en `http://localhost:5173`.

## Probar desde el celular (misma red WiFi)

Para tocar la app **con el dedo** contra **Supabase dev** sin desplegar: la Mac no “es” un iPhone, pero el **teléfono en la misma red** sí usa el mismo motor que en calle.

1. Completá **`.env`** con el proyecto **dev** (como arriba).  
2. Ejecutá **`npm run dev:host`** (Vite en `0.0.0.0:5173`).  
3. En el teléfono abrí **http://TU-IP-LAN-MAC:5173** (la IP la ves en Ajustes → Red o con `ipconfig getifaddr en0` / `en1`).  
4. Si no entra: revisá **firewall** en macOS y que el WiFi no tenga **aislamiento de clientes**.  
5. **PWA / SW:** en **HTTP** local el comportamiento puede diferir de **https://preview.pandi.company**; para Fase A tipo “instalada + HTTPS” usá Preview. Detalle: **`docs/FASE_A_PRUEBAS_MOVIL_PWA.md`**.

## Opción B — Excel Pandy-Dev

Si tenés **`docs/Pandy_Dev_Supabase.xlsx`** (ver `docs/PANDY_DEV_SUPABASE.md`):

```bash
npm run dev:supabase:volcar
npm run dev
```

El volcar escribe `.env` y un `config.js` mínimo; el **`npm run dev`** siguiente vuelve a pasar por `build-config.js` y puede sumar iconos dev si definís `PANDI_DEV_ICON` en `.env` / `.env.local`.

## Scripts útiles

| Comando | Uso |
|--------|-----|
| `npm run dev` | Regenera `config.js` desde env + Vite en puerto 5173. |
| `npm run dev:host` | Igual que `dev` pero escuchando en **todas las interfaces** (`0.0.0.0`): podés abrir la app desde otro dispositivo en la LAN (`http://IP-de-la-Mac:5173`). |
| `npm run build` | Misma config + build de producción en `dist/`. |
| `npm run preview` | Regenera config + sirve `dist/` (probar build local). |

## Tests E2E

Credenciales y URL base: **`.env.test`** (plantilla `.env.test.example`). Guía: `docs/TESTING_E2E_GUIA.md`. `TEST_BASE_URL` debe coincidir con el puerto de Vite (por defecto `http://localhost:5173`).

## Referencias

- Claves y creación de proyecto: `docs/SUPABASE_REQUISITOS.md`
- Excel dev y volcar: `docs/PANDY_DEV_SUPABASE.md`
- Seguridad (no subir secretos): `docs/SEGURIDAD_CHECKLIST_GITHUB_VERCEL_SUPABASE.md`
- Matriz Fase A móvil/PWA y preview: `docs/FASE_A_PRUEBAS_MOVIL_PWA.md`
