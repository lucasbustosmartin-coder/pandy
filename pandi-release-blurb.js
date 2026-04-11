/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.14',
  lines: [
    'Corrección Definitiva en la Trazabilidad Virtual: Se parcharon las consultas de la PWA que omitían traer el ID del autor original al renderizar transacciones "Pendientes" en tiempo real. Ahora todo refresco visual y sincronización de base de datos extrae y respeta al usuario real que generó la orden de antemano.',
  ],
};
