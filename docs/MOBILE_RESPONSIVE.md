# Vista móvil y tablets (Pandi)

Referencia rápida de cómo se comporta la app en pantallas estrechas (≤768px) y móviles (≤480px).

**Auditoría Fase A** (matriz §3, recorrido PWA §6, checklist por vista §7, plantilla hallazgos §9, preview / local / LAN): **`docs/FASE_A_PRUEBAS_MOVIL_PWA.md`**.

## Navegación

- **Menú lateral:** fijo a la izquierda; el contenido principal tiene margen igual al ancho de la franja colapsada (56px en tablet, 52px en móvil chico).
- **Menú expandido:** drawer por encima del contenido con **backdrop** oscuro; tap fuera o **Escape** cierra (si no hay modal `.modal-backdrop.activo`).
- **Al cambiar de vista** desde el menú, el drawer se **contrae** solo en layout móvil para dejar ver la pantalla.

## Clase en `body`

- `pandi-shell-logged-in`: sesión iniciada; activa márgenes y drawer. Se quita en login.
- Sin esa clase, el contenido ocupa todo el ancho (pantallas de acceso).

## CSS principal

- **769px+:** sidebar en flujo normal; sin backdrop; `main-content` sin margen extra.
- **≤768px:** `position: sticky` en `.page-header` (**grid**: logo+título arriba, bloque usuario debajo), safe areas, tablas con scroll horizontal, toolbar Cajas en columna, solapas CC/Cajas con scroll horizontal si hace falta, selects `font-size: 16px` (menos zoom iOS), modal orden “primeros datos” en una columna. **G/P Operativa:** fila de montos con ancho mínimo por moneda + scroll en wrap (incluye filas inferiores de comisión del acuerdo en el mismo layout). **CC Saldos:** tabla con scroll horizontal si los importes son largos. **Órdenes:** filtros cliente/intermediario/estado (y los del modal pendientes) en **columna** con `.ordenes-filtros-wrap` y selects a ancho completo. **Modales pendientes** (órdenes y transacciones): `.modal-body` en columna con `min-width: 0` y la tabla dentro de un wrap con scroll horizontal y vertical cuando hace falta.
- **≤480px:** ajustes extra de padding, toasts a ancho completo con safe area inferior.

## Tablas (estándar LyP)

- Encabezados **`thead th`** con **`position: sticky`** en wraps de listado, modales y CC; los listados usan **`tabla-clientes-wrap tabla-wrap-con-scroll`** (o **`tabla-movimientos-wrap tabla-wrap-con-scroll`** en Cajas) con **`max-height: 70vh`** y **`overflow-y: auto`** para que el scroll vertical sea el del contenedor y el sticky funcione (con solo `overflow-x: auto` el `thead` no ancla bien al scrollear la página). Excepción visual: tabla de usuarios en Seguridad (fondo oscuro). Regla Cursor: `.cursor/rules/tablas-y-movil-lyp.mdc`.
- **Cajas → Movimientos:** `#cajas-tabla-wrap.cajas-mov-tabla-outer` con scroll unificado (`overflow: auto`, `scrollbar-gutter: stable`, barra de scroll fina en Windows/WebKit); tabla `#tabla-movimientos-caja.tabla-cajas-mov` con **`table-layout: auto`** y **`width: max-content`** para no comprimir columnas tras el bloque fijo: **Fecha … Tipo** fijas al scroll horizontal (`position: sticky; left`), **Movimiento** con ancho moderado (~14rem), **Concepto** con `min-width` amplio (~22rem) para pocas líneas; Moneda, Monto, Caja, Usuario y acciones con mínimos propios; preferencia de producto: **scroll horizontal** antes que encajar todo en viewport.
- **Órdenes (vista principal):** `#ordenes-tabla-wrap.ordenes-tabla-outer` con el mismo criterio de scroll; tabla `#tabla-ordenes.tabla-ordenes-sticky` con columnas **Nº … Cliente** (cuatro primeras) **sticky** a la izquierda; **Cliente** con ancho fijo y ellipsis, `title` con el nombre completo al pasar el mouse; `border-collapse: separate` solo en esta tabla para sombras entre columnas fijas y el resto.

## Modal Nueva orden

El flujo depende del **tipo de operación** (participantes, bloque azul, patrón intermediario, instrumentación). Regla explícita para no regredir en móvil: **`.cursor/rules/nueva-orden-responsive.mdc`** (también enlazada desde `reglas-pandi.mdc`).

## Archivos

- Estilos responsive: principalmente **`style.css`** (`@media` ≤768 / ≤480, safe area, modales, tablas).
- Lógica menú/backdrop: **`main.js`** (`pandiIsMobileNavLayout`, `pandiSyncSidebarBackdrop`, `pandiCollapseMobileSidebarAfterNav`).
