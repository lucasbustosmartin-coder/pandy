/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.40',
  lines: [
    'Al anular una orden se quitan también las comisiones del acuerdo guardadas para esa orden, para que no sigan figurando como pendientes en listados o paneles.',
    'El aviso de confirmación al anular aclara que se eliminan esas comisiones y las marcas de comisiones ya generadas vinculadas a la orden.',
  ],
};
