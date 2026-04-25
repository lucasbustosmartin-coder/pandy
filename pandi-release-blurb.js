/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.6',
  lines: [
    'Ganancias y pérdidas: al abrir el desglose completo, una sección aparte muestra la ganancia neta de cada orden según comisiones del acuerdo (sin mezclar caja o cuenta corriente con el nominal de la operación).',
    'El resumen de P&L en Inicio queda alineado para no duplicar el efecto de esas comisiones en las cifras de las cards.',
  ],
};
