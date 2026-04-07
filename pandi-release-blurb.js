/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.7',
  lines: [
    'G/P Operativa: el ojo junto a cada moneda aparece cuando el importe es distinto de cero, también si es negativo (misma alineación que antes).',
    'El desglose por fila en el modal usa el mismo criterio en los totales por moneda.',
  ],
};
