/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 * `lines: []` = despliegue silencioso: no hay cartel de novedades al recargar (el login no espera Entendido).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.29',
  lines: [
    'Al cambiar el modo de pago de una transacción ejecutada, la caja respeta la fecha original del movimiento.',
    'Las bajas y reversiones ya no borran movimientos de caja ni de cuenta corriente: quedan anulados y visibles en el historial.',
    'Mayor consistencia de cuenta corriente y caja al guardar o editar transacciones.',
  ],
};
