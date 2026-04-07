/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.9',
  lines: [
    'Multicontraparte manual: el ingreso del acuerdo hacia Pandy en moneda recibida vuelve a registrar el par Cobro realizado y Ajuste libro que netean en cero en la cuenta del cliente del acuerdo, para que el saldo en USD no sume de más frente a otra pata del mismo acuerdo.',
    'Re-sincronizá las órdenes multicontraparte afectadas para regenerar movimientos de cuenta corriente.',
  ],
};
