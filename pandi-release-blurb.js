/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.39',
  lines: [
    'Cuenta corriente alineada al guardar o refrescar órdenes con multicontraparte manual y reglas: las filas pendientes que ya no corresponden deberían actualizarse bien cuando todas las transacciones están ejecutadas.',
    'Ajuste fino en cómo se interpreta el estado de cada transacción al sincronizar, para que «ejecutada» se reconozca de forma uniforme en toda la app.',
  ],
};
