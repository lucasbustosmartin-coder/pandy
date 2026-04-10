/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.10',
  lines: [
    'Incorporamos etiquetas visuales de color en Cuentas Corrientes para resaltar con mayor facilidad los estados (Pendiente, Cerrado, Anulada).',
    'Agregamos información del Usuario en ambas pestañas de movimientos de la cuenta corriente, brindando más contexto en pantalla sobre interacciones y responsables.',
  ],
};
