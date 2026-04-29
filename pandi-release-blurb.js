/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.10',
  lines: [
    'En cheque en pesos con intermediario, la comisión del acuerdo en caja queda siempre en transferencia bancaria (bolsa Banco), no en efectivo ni en bolsa Cheque.',
    'Cuando la ganancia de la empresa se registra como movimiento aparte, el modo de pago y la bolsa de caja siguen al ingreso principal del cliente (por ejemplo también en Banco si cobraste por transferencia).',
  ],
};
