/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.6',
  lines: [
    'En G/P Operativa del Panel, el ojo para ver el desglose completo queda junto a «Total»; en cada fila, un ojo aparece solo a la derecha de cada importe mayor que cero (USD, ARS o EUR), alineado en columnas.',
    'Al tocar ese ojo abrís el detalle filtrado por esa moneda; el signo de ayuda sigue al lado del nombre de cada fila.',
  ],
};
