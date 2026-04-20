/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.56',
  lines: [
    'Cuenta corriente (dólar con intermediario): al compensar saldo al invertir un cobro, el detalle ya no muestra dos veces el mismo importe pendiente.',
    'Las leyendas «compensación parcial» o «total» siguen la deuda previa de la operación; conviene refrescar Cuenta corriente para ver movimientos regenerados.',
  ],
};
