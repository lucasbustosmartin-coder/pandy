/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.6.1',
  lines: [
    'En G/P Operativa, al abrir el detalle de «Movimientos de caja por órdenes», cada fila indica el modo de pago de la operación (efectivo, transferencia bancaria o cheque).',
    'Así se entiende de un vistazo qué entra en esa fila sin separar totales en el panel.',
  ],
};
