/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.26',
  lines: [
    'En Nueva orden, si el tipo lleva intermediario y el cliente y el intermediario son el mismo par vinculado en el sistema, la app te avisa y te orienta a usar el tipo sin intermediario y multiparte.',
    'Las ayudas en Participantes e Intermediarios y el manual quedaron alineados a ese criterio.',
  ],
};
