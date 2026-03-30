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

- `SUPABASE_URL` y `SUPABASE_ANON_KEY` deben existir **por entorno**:
  - **Production** → proyecto Supabase **productivo**.
  - **Preview** → proyecto Supabase **desarrollo** (misma app, otra base).
- Las anon keys son JWT: los primeros caracteres suelen verse iguales entre proyectos; confirmar que URL y clave **completas** correspondan a cada Supabase.

Opcional: `SUPABASE_SERVICE_ROLE_KEY` solo si la app en producción necesita operaciones con service role (usar con cuidado).

Así `config.js` se genera en el build (`node scripts/build-config.js`) y la app no queda en blanco por falta de config.

### Dominios propios (referencia actual Pandi)

| Host | Entorno Vercel | Notas |
|------|----------------|--------|
| **https://pandi.company** | Production | Dominio principal en producción. |
| **https://pandy-tau.vercel.app** | Production | Dominio por defecto Vercel (sigue válido como alias). |
| **https://preview.pandi.company** | Preview | Ligado en Vercel a la rama Git **`preview-empleado`**: muestra el último deploy Preview de esa rama. Variables Preview → Supabase **dev**. |

La URL “fea” que cambia en cada `npx vercel --yes` sigue existiendo en **Deployments**; el subdominio **`preview.pandi.company`** es un nombre estable para compartir el entorno de prueba **siempre que la rama `preview-empleado` esté alineada con `main`** (ver §4c).

---

## 4. Despliegue manual

Después de push a `main`, desde la raíz:

```bash
vercel --prod
npx vercel --yes
```

El segundo comando (sin `--prod`) es **obligatorio** en el flujo acordado: publica **Preview** con el mismo código que acaba de ir a prod; variables **Preview** en Vercel deben apuntar a Supabase **desarrollo**. Ver §4b.

O configurá en Vercel el redeploy automático al hacer push a `main`; igual conviene ejecutar **`npx vercel --yes`** después para no dejar Preview desactualizado respecto a prod.

### 4b. Preview alineado con producción (mismo front, base dev)

**Siempre** tras cada despliegue a producción (manual o “ok desplegar”), ejecutá desde la raíz:

```bash
npx vercel --yes
```

Sin `--prod`: genera un deployment Preview; la URL con hash puede cambiar cada vez. Requiere proyecto enlazado (`vercel link`) y sesión de Vercel CLI, o `VERCEL_TOKEN`. Detalle del flujo completo (“ok desplegar”) en la regla **bitácora-tareas** (`.cursor/rules/bitacora-tareas.mdc`).

(Así el build Preview ejecuta `node scripts/build-config.js` y embebe la config dev en `config.js`.)

Opcional: repetir el par **dev** también para entorno **Development** si usás `vercel dev` local.

### 4c. Alinear `preview.pandi.company` con el mismo commit que producción

El hostname **`preview.pandi.company`** está asociado en Vercel a la rama Git **`preview-empleado`**. Un `npx vercel --yes` desde `main` no actualiza ese dominio por sí solo.

Tras **push a `main`**, `vercel --prod` y `npx vercel --yes`, conviene **actualizar esa rama** para que el subdominio estable muestre el mismo código que prod:

```bash
git checkout main
git pull origin main
git checkout preview-empleado
git merge main -m "sync: preview-empleado con main"
git push origin preview-empleado
git checkout main
```

Si `preview-empleado` no existe en el remoto, crearla una vez desde `main` y pushearla; en Vercel el dominio Preview debe apuntar a esa rama.

### Alternativa por Git (si no usás CLI)

Si no usás el paso con `npx vercel --yes`, `main` suele disparar solo **Production**. Para un Preview por integración Git:

```bash
git checkout main
git pull origin main
git checkout -b preview-empleado
git push -u origin preview-empleado
```

(Nombre de rama libre: `preview-empleado`, `staging`, etc.)

Luego en **Vercel → Deployments** copiá la **URL del Preview** de esa rama, o usá el dominio asignado (p. ej. `preview.pandi.company`). Los usuarios deben existir en **Auth del Supabase dev**.

### Volver a trabajar en `main`

```bash
git checkout main
```
