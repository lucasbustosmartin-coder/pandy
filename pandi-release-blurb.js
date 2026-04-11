/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.24',
  lines: [
    'Al anular una orden, la cuenta corriente de esa operación se vuelve a armar como siempre: vas a ver las líneas en anulado con la etiqueta Anulada y no suman al saldo, también cuando todas las transacciones estaban pendientes.',
    'El mensaje de confirmación al anular explica mejor qué pasa con la vista y con la caja. Si tenías órdenes viejas anuladas sin movimientos en CC, un Refrescar en Cuenta corriente ayuda a alinearlas.',
  ],
};
