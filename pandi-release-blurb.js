/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.60',
  lines: [
    'Dólar–peso (o peso–dólar) con intermediario en el patrón cobro a Pandy y entrega del intermediario al cliente: al cerrar el acuerdo, la cuenta corriente del cliente con Pandy deja de mostrar una deuda en pesos que en realidad corresponde al circuito con el intermediario.',
    'El cierre «Cierre orden» sigue compensando el cobro en la moneda recibida; la parte en pesos queda reflejada en la cuenta corriente del intermediario, no como saldo pendiente del cliente frente a Pandy.',
  ],
};
