/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.7',
  lines: [
    'Visibilidad financiera: ahora el historial de la Cuenta Corriente transparenta los movimientos anulados, mostrándolos en color rojo en la cuadrícula general sin alterar el balance.',
    'Corrección de sincronía en anulaciones: el sistema contable estricto ahora comprende retroactivamente aquellas transacciones anuladas manualmente o desde el origen.',
  ],
};
