/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.51',
  lines: [
    'Nuevo menú «Control de calidad» con un informe por período para revisar coherencia entre caja, cuenta corriente del cliente y transacciones.',
    'En el panel de inicio, la tarjeta de ganancia/pérdida operativa queda centrada en la matriz; las alertas de control pasan a la vista dedicada.',
    'Si tu perfil tenía permiso de control heredado, seguís pudiendo abrir el informe hasta que el administrador unifique los permisos en Seguridad.',
  ],
};
