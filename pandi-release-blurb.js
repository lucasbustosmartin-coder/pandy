/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.18',
  lines: [
    'Mejoras de rendimiento general, pensadas para que la app siga respondiendo bien a medida que crece el volumen de datos.',
    'Al actualizar pantallas con mucha información, el recálculo aprovecha mejor la conexión.',
    'Los importes y el criterio de las operaciones no cambian con esta versión.',
  ],
};
