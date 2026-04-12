# Fase A — Matriz de pruebas móvil y PWA (no productivo)

Guía para **autoparecer** el criterio del skill **`.cursor/skills/responsive-pwa-web-design/SKILL.md`** (viewport, breakpoints 768/480, PWA mínimo, overscroll, anti‑patrones) sin usar **Supabase ni front de producción**.

## Resumen

| Qué probás | Entorno recomendado |
|------------|---------------------|
| **Layout, breakpoints, touch “real”** | Mac: Chrome/Safari **DevTools** dispositivo; o celular en **misma WiFi** con `npm run dev:host` (Supabase **dev** en `.env`). |
| **PWA instalada, SW, “Añadir a inicio”, HTTPS** | **https://preview.pandi.company** (Preview Vercel + Supabase **dev**) o build local `npm run preview` en **HTTPS** si lo exponés con túnel (no cubierto aquí). |
| **Solo “se ve como teléfono” en la Mac** | Sí: **emulación** en DevTools (no reemplaza iOS real ni gestos del SO). |

---

## 1. Preparación entorno no productivo

### Opción A — Preview estable (HTTPS, PWA completa)

1. Abrí **https://preview.pandi.company** (variables **Preview** en Vercel → proyecto Supabase **desarrollo**).  
2. Usuario de prueba debe existir en **Auth del proyecto dev** (no en prod).  
3. Detalle de dominios y paridad con `main`: **`docs/GIT_Y_VERCEL.md`** (tabla de hostnames, §4b–§4d).

### Opción B — Local + Supabase dev

1. **`.env`** con `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto **dev** (`cp .env.example .env`).  
2. No dejes `SUPABASE_*` de producción en **`.env.local`** (pisa `.env`). Ver **`docs/DESARROLLO_LOCAL.md`**.  
3. `npm run dev` → **http://localhost:5173**

### Opción C — Local visible desde el celular (misma red)

1. Misma **`.env`** que la opción B.  
2. En la Mac, desde la raíz del repo: **`npm run dev:host`** (Vite escucha en `0.0.0.0:5173`).  
3. En el teléfono (misma WiFi): **http://TU-IP-LAN-MAC:5173** (ej. `http://192.168.0.42:5173`).  
   - macOS: **Ajustes del Sistema → Red → Wi‑Fi → Detalles** (o en terminal: `ipconfig getifaddr en0` / `en1` según interfaz).  
4. Si no carga: firewall de macOS (“entrada” para **node**), o router con **AP/client isolation**.  
5. **Nota:** el dev server es **HTTP**. La app habla con Supabase por **HTTPS**; eso está bien. El comportamiento del **service worker / instalación PWA** puede diferir del **preview HTTPS**; para **PWA fina** priorizá **preview.pandi.company**.

---

## 2. ¿La Mac “como teléfono”?

- **Sí, parcialmente:** Chrome o Safari → **Inspeccionar** → icono **dispositivo** / modo responsive: mismos **CSS breakpoints** (p. ej. 768, 480), scroll, muchas reglas de layout.  
- **No es equivalente a un teléfono:**  
  - **Safari iOS** (motor, 100vh, overscroll, PWA standalone) solo se aproxima con **Safari en dispositivo** o simulador iOS (Xcode).  
  - **Touch real**, teclado virtual, **notch / Dynamic Island**, **gesto “atrás”** del SO: mejor **dispositivo físico** o Preview en el iPhone.  
- **Conclusión:** usá la Mac para **pasadas rápidas** de Fase A; cerrá dudas con **preview en el celular** o `dev:host` en el celular.

---

## 3. Matriz de anchos (skill: breakpoints + viewport)

Marcá **OK / Falla / N/A** y una nota breve.

| Ancho (CSS px) | Uso típico | Login | Inicio | Menú drawer | CC movimientos | Nueva orden (wizard) |
|----------------|------------|:-----:|:------:|:-------------:|:--------------:|:---------------------:|
| 320 | iPhone SE | | | | | |
| 375 | iPhone clásico | | | | | |
| 390 | iPhone 12/13 | | | | | |
| 414 | iPhone Plus | | | | | |
| 768 | Tablet / breakpoint app | | | | | |
| 480 | Móvil chico (segundo breakpoint) | | | | | |

**Landscape:** repetí al menos **Inicio** y **Nueva orden** en **390×844** horizontal.

---

## 4. Checklist shell PWA (skill: PWA mínimo + viewport)

| Ítem | Qué mirar |
|------|-----------|
| **Viewport** | `width=device-width`, `viewport-fit=cover` (ya en `index.html`). Contenido bajo notch / barra de estado legible. |
| **Theme / barra** | `theme-color` y `apple-mobile-web-app-status-bar-style` coherentes con cabecera y sidebar. |
| **Standalone** | Si la instalás desde el navegador: sin UI del browser; logo/título; recarga. |
| **Actualización** | Tras un deploy de prueba: si aparece **“Nueva versión”**, ¿se lee y se confirma bien en pantalla chica? |
| **Offline** | Modo avión breve: banner/toast esperables; sin `alert()` del navegador para flujos ya cubiertos por la app. |

---

## 5. Patrones frágiles (skill — solo observar en A)

- Scroll horizontal “fantasma” en todo el documento.  
- Modales con el **teclado** abierto: ¿algún campo queda tapado?  
- Tablas: ¿el **thead** se comporta al scrollear dentro del contenedor con altura?  
- **Overscroll horizontal** que dispare “atrás” en el navegador (en PWA instalada puede variar).

---

## 6. Recorrido sugerido (~15–20 min, PWA preview)

Hacelo en **preview** desde el icono de inicio (standalone). Orden propuesto:

1. **Login** — teclado email/contraseña; ¿zoom raro? ¿botón Entrar cómodo?  
2. **Inicio** — tarjetas caja / pendientes; scroll vertical; tocar **Ver** en pendientes si aplica.  
3. **Menú** — abrir drawer (flecha), elegir una vista, **cerrar** con tap fuera y con **menú otra vez**; comprobar que el contenido queda usable (no tapado por la franja).  
4. **Órdenes** — barra de filtros: ¿todo usable sin scroll horizontal incómodo en **375**?  
5. **Cuenta corriente (cliente)** — scroll horizontal en movimientos; **deslizar** en la tabla sin que la app “salga atrás”.  
6. **Nueva orden** — abrir wizard, primer paso: combo tipo de operación (altura táctil), **Siguiente** si podés sin guardar datos inválidos.  
7. **Modal / detalle** — si tenés **G.P. operativa** o **Ver detalle** en CC: abrir uno y cerrar.  
8. **Offline** — **Modo avión** 10–15 s: leé el mensaje; volvé online y esperá recuperación normal.  
9. **Toasts** — dispará un guardado o acción que muestre toast: ¿legible? ¿cerrar con el dedo?

Si algo falla, anotá en la **plantilla §9** (no hace falta completar toda la matriz §3 el primer día).

---

## 7. Checklist por vista (marcar OK / Falla + nota)

| Vista / flujo | Qué validar (skill) |
|-----------------|----------------------|
| **Login** | Safe area, campos ≥44px de comodidad, sin desborde. |
| **Inicio** | Cards, grillas, periodos G.P. si los usás: scroll horizontal **dentro** del bloque, no “toda la página” rota. |
| **Órdenes** | Filtros en fila vs columna ≤768; selects **16px** (evitar zoom iOS). |
| **Órdenes pendientes** (modal si lo usás) | Cabecera, tabla, cierre; z-index sobre drawer. |
| **CC listado clientes** | Tabla / wrap; sticky si hay muchas filas. |
| **CC movimientos** | Scroll X en tabla ancha; sticky thead; overscroll. |
| **Cajas** | Solapas, tablas, inputs montos. |
| **Clientes / Intermediarios** | Listados y formularios modales. |
| **Seguridad / permisos** | Tabla ancha + chips; ≤480 ya tiene ajustes — ¿algo se corta? |
| **Empresa (marca)** | Campos y preview logo. |
| **Nueva orden (wizard)** | Label+control en móvil; instrumentación tabla con scroll; teclado. |
| **Cola offline / borradores** | Si usás offline: lista, editar, reintentar. |
| **Ayuda (? → modal)** | Scroll largo en modal ayuda. |
| **Confirmar / Nueva versión** | Botones táctiles, texto sin cortar. |

---

## 8. Pistas desde código (no reemplazan el iPhone)

Solo para **saber dónde mirar** en el dispositivo; la verdad es el resultado en **preview**.

- En **≤768** muchos filtros y modales fuerzan **`font-size: 16px`** y **`min-height: 44px`** en **`style.css`**; en **`index.html`** aún hay **estilos inline** en algunos filtros de órdenes (tamaños fijos en px): conviene **comparar** comportamiento Órdenes vs modales CC manual (ya con 16px explícito).  
- **Drawer vs modales:** en CC/GP ya se subió z-index para que el modal no quede detrás del menú móvil; si algún **otro** modal “no recibe toques”, anotarlo.  
- **Nueva orden:** regla **`.cursor/rules/nueva-orden-responsive.mdc`** — si un tipo de operación se ve mal, anotá **cuál** (código de tipo).

---

## 9. Plantilla de hallazgos (al cerrar o en curso)

Copiá filas según encuentres:

| Vista o flujo | Severidad (B / M / D) | Nota (una frase) |
|---------------|----------------------|------------------|
| Ej. CC movimientos | M | En 375 el filtro queda… |
| | | |

- **B** = bloqueante (no podés operar o perdés datos).  
- **M** = mejora clara de UX.  
- **D** = detalle cosmético.

Esa tabla alimenta la **Fase B** (filtros / inline) y siguientes.

---

## 10. Al cerrar Fase A

- Tenés al menos un **recorrido §6** completo en **PWA preview** y/o la **matriz §3** con una fila ancho típico (ej. **390**) marcada.  
- Hallazgos volcados a **§9** o a issues.  
- Seguí **`docs/MOBILE_RESPONSIVE.md`** y las fases B–G cuando pasemos a cambios de código.

### Ajustes ya aplicados en código (retroalimentación Fase A)

- **G/P Operativa (≤768):** grilla de importes con `minmax` + `max-content` y `white-space: nowrap` en números para que el **scroll horizontal** del wrap muestre importes largos sin amontonar.  
- **Cabecera usuario (≤768):** `page-header` en **CSS grid** (logo + título / fila siguiente: identidad + acciones); email y nombre a **ancho completo**; **Guardar** + **Actualizar** + **Cerrar sesión** agrupados en `.user-bar-acciones`.  
- **CC Saldos (≤768):** tabla con `table-layout: auto` y `width: max-content` solo en `#cc-panel-saldos`, columnas de montos con `min-width` + scroll en `#cc-contenido`.

---

## Referencias cruzadas

- `docs/MOBILE_RESPONSIVE.md` — comportamiento del shell en ≤768 / ≤480.  
- `docs/DESARROLLO_LOCAL.md` — `.env`, `dev:host`.  
- `docs/GIT_Y_VERCEL.md` — **preview.pandi.company** vs producción.  
- Skill: `.cursor/skills/responsive-pwa-web-design/SKILL.md`
