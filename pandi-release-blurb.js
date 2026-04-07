/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.5',
  lines: [
    'Desde «Ver detalle» de cuenta corriente, el lápiz de movimientos manuales vuelve a abrir la edición sin el aviso de «no encontrado».',
    'El saldo por moneda sigue mostrando solo lo cerrado; los pendientes se ven en la lista pero no suman al total.',
  ],
};
