---
name: responsive-pwa-web-design
description: Diseña y revisa layouts web responsivos, tablas con scroll seguro, modales y formularios móviles, y PWA (manifest, service worker, offline, instalación). Usar cuando el usuario pida responsive, móvil, breakpoints, PWA, instalación en home, offline, viewport, touch targets o accesibilidad táctil.
---

# Experto en diseño web responsivo y PWA

## Cuándo aplicar este skill

- Pantallas **≤768px** y **≤480px**, **touch targets ≥44px**, **inputs sin zoom accidental** en iOS (`font-size: 16px` donde aplique).
- **Tablas anchas**: contenedor `overflow-x: auto`, scroll táctil, **evitar gesto “atrás”** del navegador con `overscroll-behavior-x` en `html`/`body` y en el wrap (`contain` / `none` según capa).
- **Modales y wizards**: `min-width: 0`, `max-width: 100%`, sin desborde horizontal; en móvil, **etiqueta inmediatamente seguida del control** (flex + `order` o DOM reordenado).
- **PWA**: manifest, iconos, `display`/`theme_color`, **service worker** (caché, actualización, fondo), **modo offline** y mensajes al usuario.
- **Rendimiento percibido**: CLS, lazy, imágenes adaptativas, **Lighthouse** PWA/Performance como guía, no como obsesión.

## Checklist responsive (rápido)

1. **Viewport**: `width=device-width`, `viewport-fit=cover` si hay notch/safe area.
2. **Breakpoints**: al menos **768** y **480**; probar ancho intermedio (tablet portrait).
3. **Tipografía y espaciado**: escalar padding/márgenes; no depender solo de `px` fijos en toolbars.
4. **Tablas**: `thead` **sticky** si hay scroll vertical en un contenedor definido; fondo opaco en `th` con `border-collapse: collapse`.
5. **Botones**: área táctil suficiente; icono + texto alineados al patrón del proyecto si existe.
6. **Formularios**: selects/inputs con altura mínima cómoda en móvil; grids que en estrecho pasen a **columna**.
7. **Medios**: `srcset`/`sizes` o CSS `max-width: 100%` en imágenes dentro de layouts flex/grid.

## PWA — decisiones mínimas

| Tema | Criterio |
|------|----------|
| **Manifest** | `name`, `short_name`, `start_url`, `display` (standalone/browser), `theme_color`, `background_color`, iconos **192** y **512** (más maskable si aplica). |
| **SW** | Estrategia de caché explícita (estática vs API); **versión** o detección de actualización para evitar bundle viejo “pegado”. |
| **Offline** | Qué pantallas/acciones funcionan sin red; colas diferidas si el producto lo requiere; feedback claro (no `alert()` si el proyecto usa toasts/modales). |
| **HTTPS** | Requisito para SW en entornos reales; dominios y scope coherentes con `start_url`. |

## Patrones frágiles (evitar)

- `100vw` con scrollbar que genera **scroll horizontal fantasma**.
- `position: fixed` sin contemplar **teclado móvil** que tapa inputs.
- Sticky `thead` sin ancestro con **altura/overflow** claro → encabezado “flota” mal.
- PWA sin plan de **actualización**: usuarios con assets viejos y datos inconsistentes.

## Formato de salida del agente

Al **revisar** o **proponer** UI:

1. **Resumen** (2–4 líneas): qué pantalla/flujo y viewport.
2. **Problemas** ordenados por severidad (bloqueante / mejora / detalle).
3. **Cambios concretos** (CSS/markup o checklist de SW/manifest), alineados a convenciones del repo si existen (p. ej. clases globales, design system).
4. **Prueba sugerida**: dispositivo o ancho + navegador (Safari iOS si hay formularios/PWA).

## Recursos opcionales (profundizar)

- Detalle extendido o plantillas por stack: añadir `reference.md` en esta misma carpeta y enlazarlo aquí cuando haga falta.

## Ubicación y copia en el repo

- **En Pandi:** este skill está **versionado** en **`.cursor/skills/responsive-pwa-web-design/SKILL.md`**, para que un `git clone` del solo repo **Pandi** tenga la ruta que usa la regla **`responsive-pwa-skill.mdc`** sin depender de carpetas externas.
- **Monorepo LyP (opcional):** si también usás **`LyP/.cursor/skills/`** como copia canónica compartida con otros proyectos, podés enlazar en local `Pandi/.cursor/skills` → `../../.cursor/skills`; **no** subas ese symlink a Git (rompe clones que no tienen el árbol `LyP/`). Tras editar en LyP, copiá o sincronizá los cambios a esta carpeta del repo Pandi antes de commitear.
- **Cursor global:** skills en **`~/.cursor/skills/`** aplican a todos los proyectos de la máquina si los configurás ahí.
