/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.3',
  lines: [
    'Al avisar de una actualización, verás el detalle de novedades de la versión nueva — en la computadora y en la app instalada.',
    'G/P Operativa: el total por moneda suma las cuatro filas del cuadro; cada fila tiene su ayuda (qué entra en el período y qué no).',
    'Las ayudas distinguen dinero en caja y lo que ves desde cuenta corriente en ese resumen; el período del panel sigue la semana en Argentina (lunes a domingo).',
  ],
};
