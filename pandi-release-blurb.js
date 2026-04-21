/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.64',
  lines: [
    'Si desactivás la instrumentación multicontraparte manual en una orden, esa elección se respeta: al sincronizar cuenta corriente no se vuelve a encender sola hasta que vos la marques de nuevo.',
    'Cuando la instrumentación se alejó del modelo sugerido o hay varias patas de cobro y pago, el sistema puede activar multicontraparte donde el tipo de orden lo permite, para que los movimientos sigan alineados con lo cargado.',
    'Ajustes y textos de ayuda para operar con más claridad en esos casos.',
  ],
};
