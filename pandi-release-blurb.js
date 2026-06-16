/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.15',
  lines: [
    'En órdenes cheque en pesos con intermediario, si invertís quién paga y quién cobra en la pata con el intermediario, la cuenta corriente del intermediario muestra el saldo correcto (deuda neta menos comisión).',
    'Al volver a la instrumentación estándar después de un desvío, la cuenta corriente del cliente vuelve al criterio habitual sin quedar bloqueada por ajustes anteriores.',
    'Resincronizá las órdenes cheque en pesos con intermediario que hayas modificado para actualizar los movimientos en cuenta corriente.',
  ],
};
