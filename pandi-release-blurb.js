/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.25',
  lines: [
    'Corrección al armar la cuenta corriente cuando una orden quedó anulada sin llegar a ejecutar ninguna transacción: ahora deberían aparecer las líneas en Anulada tras usar Refrescar.',
    'Sigue valiendo lo anterior: al anular, la vista recalcula esa orden y las anuladas no suman al saldo.',
  ],
};
