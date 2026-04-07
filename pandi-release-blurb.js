/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.4',
  lines: [
    'En Cuenta corriente, el saldo por moneda (resumen, «Ver detalle» y totales de la pestaña Movimientos) suma solo movimientos cerrados.',
    'Los movimientos en estado Pendiente siguen en la lista para verlos, pero ya no entran en el total — igual para clientes e intermediarios.',
  ],
};
