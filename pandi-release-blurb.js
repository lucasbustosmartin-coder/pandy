/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.6.0',
  lines: [
    'Multicontraparte manual: en cuenta corriente del cliente del acuerdo, el ingreso ejecutado hacia Pandy en moneda recibida deja solo la línea «Ajuste libro acuerdo» (+) y ya no muestra «Cobro realizado» (−) en esa pata.',
    'Re-sincronizá las órdenes multicontraparte afectadas para que el saldo en USD refleje el cambio.',
  ],
};
