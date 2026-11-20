---
name: pandi-ui-responsive
description: Reglas de UI, responsive móvil y PWA de Pandi (breakpoints 768/480, tablas con thead sticky y overscroll, modales, Nueva orden, botones con icono, ayudas en modal, toasts, PWA/offline). Usar al revisar o cambiar index.html, style.css, modales, tablas, wizard de Nueva orden, manifest, service worker u offline.
---

# UI responsive y PWA — Pandi

1. Leer `.cursor/skills/responsive-pwa-web-design/SKILL.md` (checklist y formato de salida para revisiones: resumen → problemas por severidad → acciones → prueba sugerida).
2. Respetar, en este orden de prioridad, las reglas del repo:
   - `.cursor/rules/tablas-y-movil-lyp.mdc` — `thead` sticky con fondo opaco; 768/480; touch 44px; inputs 16px en iOS.
   - `.cursor/rules/gestos-trackpad-overscroll-spa.mdc` — `overscroll-behavior-x: none` en `html/body`, `contain` en `.main-content` y en cada wrap con `overflow-x: auto`.
   - `.cursor/rules/nueva-orden-responsive.mdc` — modal Nueva orden por tipo de operación.
   - `.cursor/rules/estilos-botones.mdc` — icono SVG a la izquierda; icon-only con `title` + `aria-label`; Excel verde.
   - `.cursor/rules/help-popovers.mdc` — ayudas en `#modal-help-backdrop`.
   - `.cursor/rules/excel-export-importes-numericos.mdc` — importes numéricos en Excel.
3. Mensajes: `showToast` / `showConfirm`, nunca `alert` / `confirm`.
4. Verificar en el navegador integrado (o `npm run dev` en :5173) a 1280, 768 y 375 px de ancho antes de cerrar. Docs: `docs/MOBILE_RESPONSIVE.md`, `docs/PWA_OFFLINE_TECNICO.md`, `docs/MANUAL_USUARIO_OFFLINE.md`.
5. Cambios de PWA/SW/cache: impactan a todos los usuarios instalados → protocolo de impacto obligatorio.
