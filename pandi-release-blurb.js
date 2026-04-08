/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.0',
  lines: [
    'Podés poner un nombre visible para cada usuario: en la barra superior para tu perfil y, si sos admin, en Seguridad para el resto.',
    'En órdenes, transacciones y cajas se muestra quién actuó con ese nombre (si no hay nombre, el correo).',
    'Las exportaciones a Excel y el pie de «Exportado por» usan el mismo criterio.',
  ],
};
