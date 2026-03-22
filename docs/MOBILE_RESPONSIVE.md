# Vista móvil y tablets (Pandi)

Referencia rápida de cómo se comporta la app en pantallas estrechas (≤768px) y móviles (≤480px).

## Navegación

- **Menú lateral:** fijo a la izquierda; el contenido principal tiene margen igual al ancho de la franja colapsada (56px en tablet, 52px en móvil chico).
- **Menú expandido:** drawer por encima del contenido con **backdrop** oscuro; tap fuera o **Escape** cierra (si no hay modal `.modal-backdrop.activo`).
- **Al cambiar de vista** desde el menú, el drawer se **contrae** solo en layout móvil para dejar ver la pantalla.

## Clase en `body`

- `pandi-shell-logged-in`: sesión iniciada; activa márgenes y drawer. Se quita en login.
- Sin esa clase, el contenido ocupa todo el ancho (pantallas de acceso).

## CSS principal

- **769px+:** sidebar en flujo normal; sin backdrop; `main-content` sin margen extra.
- **≤768px:** `position: sticky` en `.page-header`, safe areas, tablas con scroll horizontal, toolbar Cajas en columna, solapas CC/Cajas con scroll horizontal si hace falta, selects `font-size: 16px` (menos zoom iOS), modal orden “primeros datos” en una columna.
- **≤480px:** ajustes extra de padding, toasts a ancho completo con safe area inferior.

## Tablas (estándar LyP)

- Encabezados **`thead th`** con **`position: sticky`** en wraps de listado, modales y CC; los listados usan **`tabla-clientes-wrap tabla-wrap-con-scroll`** (o **`tabla-movimientos-wrap tabla-wrap-con-scroll`** en Cajas) con **`max-height: 70vh`** y **`overflow-y: auto`** para que el scroll vertical sea el del contenedor y el sticky funcione (con solo `overflow-x: auto` el `thead` no ancla bien al scrollear la página). Excepción visual: tabla de usuarios en Seguridad (fondo oscuro). Regla Cursor: `.cursor/rules/tablas-y-movil-lyp.mdc`.

## Archivos

- Estilos: `index.html` (`@media` y clases anteriores).
- Lógica menú/backdrop: `main.js` (`pandiIsMobileNavLayout`, `pandiSyncSidebarBackdrop`, `pandiCollapseMobileSidebarAfterNav`).
