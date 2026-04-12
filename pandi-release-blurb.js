/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.28',
  lines: [
    'Los filtros de Órdenes (y el modal de pendientes) en el celular pasan a una columna clara: cada desplegable a ancho completo, sin zoom incómodo al tocar.',
    'Seguimos mejorando el panel en pantallas chicas; revisá la guía Fase A en docs si probás en preview o en tu red con dev:host.',
  ],
};
