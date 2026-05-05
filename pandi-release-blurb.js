/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.12',
  lines: [
    'Al dar de alta o editar un cliente o un intermediario, si el nombre ya existe te lo decimos antes de guardar, para no crear fichas repetidas que después hay que dar de baja.',
    'Mientras se guarda, el botón pasa a «Guardando…» y no se puede mandar otro envío ni cerrar el cuadro por accidente; evita los duplicados por varios clics seguidos.',
  ],
};
