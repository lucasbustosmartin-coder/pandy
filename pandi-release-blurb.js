/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.6',
  lines: [
    'Potenciamos la lectura y procesamiento de la app: redujimos radicalmente el tiempo de carga del menú Cuenta Corriente.',
    'Blindamos la memoria de saldos: ahora el sistema captura el conteo histórico recursivamente y de forma ilimitada sin perder precisión.',
    'Optimizamos tu consumo: la aplicación solo reconstruye bases de datos en sincronización cuando lo pidas expresamente (botón Refrescar).'
  ],
};
