/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.65',
  lines: [
    'Corrección en cuenta corriente: cuando una operación tenía compensación por saldo (cambio de sentido del cobro respecto del modelo típico), al sincronizar ya no se fuerza un modo de instrumentación que podía alterar los importes mostrados.',
    'Si desactivás multicontraparte manual en una orden, seguimos respetando tu elección al sincronizar.',
    'Textos de ayuda actualizados en la guía de cuenta corriente para estos casos.',
  ],
};
