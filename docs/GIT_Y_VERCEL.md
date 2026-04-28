# Git y Vercel – Pandi

Para tener el repo en GitHub y la app desplegada en Vercel (redeploy automático en cada push a `main`).

**Estado actual de Pandi:** el proyecto está enlazado a Vercel con **deploy automático de Production en cada push a `main`**. El flujo operativo debe **asumir eso**: no usar `vercel --prod` como paso rutinario (evita un **segundo build** del mismo commit). Objetivo: **misma paridad** entre prod y preview estable (**§4d**) **sin gastar builds ni upload de más** — **§4e** (cuántos disparadores) y **§4f** (`.vercelignore`).

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
   - **Build Command**, **Output Directory** y **rewrites** los define el archivo **`vercel.json`** en la raíz del repo (Vercel los aplica al proyecto enlazado).
   - Con **PWA Fase 1** en el repo: build `node scripts/build-config.js && vite build` y salida **`dist/`** (antes era solo `build-config` y directorio `.`). Guía de la rama de prueba: `docs/PWA_RAMA_PREVIEW_PWA_FASE1.md`.

### Variables de entorno en Vercel

En **Settings** → **Environment Variables** del proyecto:

- `SUPABASE_URL` y `SUPABASE_ANON_KEY` deben existir **por entorno**:
  - **Production** → proyecto Supabase **productivo**.
  - **Preview** → proyecto Supabase **desarrollo** (misma app, otra base).
- Las anon keys son JWT: los primeros caracteres suelen verse iguales entre proyectos; confirmar que URL y clave **completas** correspondan a cada Supabase.

**No** definir `SUPABASE_SERVICE_ROLE_KEY` en Vercel para este frontend: el build **no** la embebe en `config.js` (evita filtrar la clave al bundle). La service role queda solo en entornos locales o CI (p. ej. `.env.test` para E2E / scripts), nunca en variables del proyecto web en producción.

Así `config.js` se genera en el build (`node scripts/build-config.js`) y la app no queda en blanco por falta de config.

### Dominios propios (referencia actual Pandi)

| Host | Entorno Vercel | Notas |
|------|----------------|--------|
| **https://pandi.company** | Production | Dominio principal en producción. |
| **https://pandy-tau.vercel.app** | Production | Dominio por defecto Vercel (sigue válido como alias). |
| **https://preview.pandi.company** | Preview | Ligado en Vercel a la rama Git **`preview-empleado`**: muestra el último deploy Preview de esa rama. Variables Preview → Supabase **dev**. *Durante pruebas PWA se puede tener `preview-empleado` con los commits de `preview-pwa-fase1`; al terminar, volver a fusionar `main` en `preview-empleado` (§4c) para alinear con producción.* |

La URL “fea” que cambia en cada `npx vercel --yes` sigue existiendo en **Deployments**; el subdominio **`preview.pandi.company`** es un nombre estable para compartir el entorno de prueba **siempre que `preview-empleado` lleve el mismo commit que `main`** (referencia: prod; ver §4c y **Dirección de la paridad**).

---

## 4. Despliegue manual

Antes del push en el flujo «ok desplegar»: subir versión en `index.html` (`#sidebar-version`), y en **`pandi-release-blurb.js`** el objeto **`PANDI_RELEASE_BLURB`** — en la práctica lo completa el **agente** al cerrar el despliegue; no es un paso manual habitual para quien pide «desplegar» (ver **bitácora-tareas**). El build genera **`pandi-release.json`** en `dist/` para que el modal lea novedades por red. El aviso **«Nueva versión»** usa HTML con logo (empresa o icono por defecto), badge de versión y lista de novedades; `lines` sigue siendo solo texto (se escapa al renderizar). **Prohibido** en `lines` mencionar **Auditoría** o cualquier cambio asociado a registro interno de acciones (copy genérico hacia usuarios si hace falta; detalle en bitácora y **bitácora-tareas** «Auditoría (prohibido en `lines`)»).

Después de push a `main`, en **Pandi** Git ya dispara **Production**; desde la raíz **no hace falta** `vercel --prod` salvo redeploy forzado o fallo del build en Vercel. Detalle de coste: **§4e**.

```bash
# Production por CLI: solo si NO tenés auto-deploy en main (no es el caso habitual en Pandi)
# vercel --prod

# Preview CLI: opcional si enseguida hacés §4c (merge a preview-empleado); ver §4e
# npx vercel --yes

# Luego §4c + §4d: merge main → preview-empleado + push y verificar SHA
```

El comando **`npx vercel --yes`** (Preview con URL efímera) es **opcional** cuando el **merge a `preview-empleado`** (§4c) se hace enseguida: ese push ya dispara un build Preview con config **dev**; ver **§4e**. Para **preview.pandi.company** sigue siendo obligatorio alinear ramas (**§4c** + **§4d**).

Ejecutá el **sync de rama** §4c y la **verificación** §4d siempre; **`npx vercel --yes`** solo si aplica lo indicado en §4e.

### 4a. Ventana horaria recomendada (Argentina, operativa)

Para cambios visibles en operación (wizard, instrumentación, CC, etc.), conviene **planificar el `push` a `main`** (y con ello el deploy de **Production** que dispara Git) **fuera del horario pico**, en la práctica **a partir de las 20:00** hora **Argentina** — timezone **`America/Argentina/Buenos_Aires`** (**20:00 ART**). No modifica el flujo técnico de Vercel; es criterio LyP de **menor impacto** sobre usuarios en vivo.

### Dirección de la paridad (no al revés)

- **Referencia del front** en el producto es **`main`** en el estado en que quedó **tras publicar en producción** (deploy **Production** en **https://pandi.company**, disparado por Git al pushear `main` en Pandi — ver **§4e**).  
- **https://preview.pandi.company** (rama **`preview-empleado`**) debe **igualarse a ese mismo front**: siempre **`git merge main` en `preview-empleado`** y push (§4c). El preview **replica** el código que ya está (o va a estar) en prod.  
- **No** es la regla de negocio “igualar producción al preview”: **no** se asume que `preview-empleado` manda y prod lo sigue. Publicar en producción es **push/commit en `main` + deploy Production**; el preview estable **solo se pone al día** trayendo `main`.

### 4b. Preview alineado con producción (mismo front, base dev)

**`npx vercel --yes`** (sin `--prod`): genera un deployment Preview con URL efímera y config **dev** en el build. **Opcional** cuando enseguida ejecutás **§4c** (push a `preview-empleado`); ver **§4e** para no duplicar builds. Requiere proyecto enlazado (`vercel link`) y sesión de Vercel CLI, o `VERCEL_TOKEN`. Flujo completo en la regla **bitácora-tareas** (`.cursor/rules/bitacora-tareas.mdc`).

El build Preview (CLI o Git en `preview-empleado`) ejecuta `node scripts/build-config.js` y embebe la config dev en `config.js`.

Opcional: repetir el par **dev** también para entorno **Development** si usás `vercel dev` local.

### 4c. Alinear `preview.pandi.company` con el mismo commit que producción

El hostname **`preview.pandi.company`** está asociado en Vercel a la rama Git **`preview-empleado`**. Un `npx vercel --yes` desde `main` **no** actualiza ese dominio: solo crea un deployment Preview con URL efímera.

**Obligatorio** en el flujo de despliegue del proyecto (misma versión del front en ambos dominios comprados): tras **push a `main`** y el deploy de **Production** que dispara Git (en Pandi es el caso habitual; **§4e**), **fusionar `main` en `preview-empleado` y pushear** para que el subdominio estable muestre el mismo commit que **pandi.company**:

```bash
git checkout main
git pull origin main
git checkout preview-empleado
git merge main -m "sync: preview-empleado con main"
git push origin preview-empleado
git checkout main
```

Si `preview-empleado` no existe en el remoto, crearla una vez desde `main` y pushearla; en Vercel el dominio Preview debe apuntar a esa rama.

### 4d. Verificación estricta: mismo commit en `main` y `preview-empleado`

**Regla del proyecto:** no dar por cerrado un despliegue sin comprobar que el remoto tiene **el mismo SHA** en ambas ramas (mismo front; solo difiere el entorno de build Vercel / `config.js`).

```bash
git fetch origin
git rev-parse origin/main origin/preview-empleado
```

Las dos líneas de salida deben ser **idénticas**. Si difieren, repetir §4c o revisar que el push a `preview-empleado` haya terminado y que Vercel haya tomado el deploy de esa rama.

### 4e. Minutos de build y coste (Vercel)

El cargo típico de facturación es por **minutos de build**. El flujo histórico del proyecto (push → `vercel --prod` → `npx vercel --yes` → merge a `preview-empleado`) puede generar **varios builds completos** del mismo commit.

**Recomendaciones (sin relajar la paridad §4d):**

1. **Evitar doble deploy a Production**  
   **En Pandi** el repo está enlazado con **deploy automático en cada push a `main`**: el push del “ok desplegar” ya dispara un build de **Production**. **`vercel --prod` no va en el flujo rutinario** (sería un segundo build del mismo commit). Reservá CLI **`vercel --prod`** solo para **forzar redeploy** o si el deploy disparado por Git **falló**. En un fork sin integración Git, ahí sí tendría sentido el CLI como único disparador.

2. **Paso `npx vercel --yes` (Preview con URL efímera)**  
   Cada ejecución es **un build Preview completo**. El **merge `main` → `preview-empleado` + push** (§4c) **también** dispara un build Preview con variables **Preview** (dev) para **preview.pandi.company**.  
   **Para ahorrar ~un build por despliegue:** podés **omitir** `npx vercel --yes` cuando vayas a ejecutar enseguida el §4c y confiés en el build que genera Git en `preview-empleado`. **Mantené** `npx vercel --yes` si necesitás validar Preview **antes** del merge, si el build por Git falló, o si el titular pide esa verificación explícita.

3. **Ignored Build Step (opcional, en el dashboard Vercel)**  
   Script que devuelva `0` para **no** buildear cuando solo cambian rutas irrelevantes al front (p. ej. solo `docs/`, `sql/` sin tocar app, `.md`). Reduce builds accidentales por commits de documentación.

4. **Previews de ramas de trabajo**  
   Cada rama/PR con Preview suma minutos. Ajustar en Vercel qué ramas generan Preview o usar protección de despliegues si el equipo abre muchos previews.

Lo **obligatorio** para cerrar un despliegue “oficial” sigue siendo: **Production al día**, **mismo SHA** en `main` y `preview-empleado` (§4d), y que **preview.pandi.company** refleje ese commit — no el número de veces que se ejecute `npx vercel --yes`.

### 4f. Upload más liviano al builder (`.vercelignore`)

Además de **no duplicar builds**, conviene **no subir al entorno de build** carpetas y archivos que el front **no usa** (`vite build` solo empaqueta el código de la app, `index.html`, `assets/`, `scripts/build-config.js`, etc.). En la raíz del repo, **`.vercelignore`** (misma idea que `.gitignore`) indica a Vercel qué rutas **excluir del upload** al servidor que ejecuta el build.

En Pandi el archivo lista, entre otras, **`docs/`**, **`sql/`**, **`tests/`**, **`.cursor/`**, **`presentacion/`**, **`Base/`**, bitácora y PDFs/manuales en raíz que no entran en el bundle. **No suma lo mismo que evitar un build completo**, pero reduce **tiempo y ancho de banda** de subida y mantiene el contexto acotado. Si en el futuro un script de build leyera algo de una ruta ignorada, habría que **sacar esa ruta** de `.vercelignore`.

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
