/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.41',
  lines: [
    'Al resincronizar cuenta corriente y caja, si la orden está anulada las transacciones de la instrumentación pasan a anulada en la base cuando aún figuraban pendientes o ejecutadas (datos viejos).',
    'Así la orden anulada y las transacciones quedan alineadas y el cálculo de movimientos refleja el mismo criterio en pantalla.',
  ],
};
