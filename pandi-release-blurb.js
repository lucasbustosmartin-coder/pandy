/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.43',
  lines: [
    'Al actualizar la cuenta corriente desde la orden, los movimientos quedan alineados con la instrumentación: si todo está ejecutado, lo ves cerrado como corresponde.',
    'Las líneas de comisión del acuerdo muestran mejor a qué transacción se refieren en el texto del movimiento.',
    'Menos situaciones en las que una comisión seguía en pendiente con la orden ya terminada.',
  ],
};
