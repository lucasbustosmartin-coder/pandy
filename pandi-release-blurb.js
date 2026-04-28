/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.9',
  lines: [
    'En operaciones cheque en pesos con intermediario, el movimiento de caja de la comisión del acuerdo va en la bolsa Cheque, coherente con el cobro por cheque.',
    'Donde aplique la ganancia de la empresa sobre el acuerdo como movimiento aparte, el modo de pago y la bolsa de caja siguen al ingreso principal del cliente (por ejemplo transferencia bancaria en lugar de efectivo).',
  ],
};
