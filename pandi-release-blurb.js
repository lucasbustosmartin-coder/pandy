/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.20',
  lines: [
    'En Cuenta corriente, la columna Usuario vuelve a mostrar quien ejecutó u originó cada movimiento vinculado a una orden, incluso después de usar Refrescar o al reabrir la vista.',
    'Los movimientos que la app recalcula desde las órdenes ya no quedan a nombre de quien solo tenía la sesión abierta.',
    'Actualizamos el manual de uso offline con esta aclaración sobre la columna Usuario.',
  ],
};
