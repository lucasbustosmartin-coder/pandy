/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.49',
  lines: [
    'Mejoras en la cuenta corriente con órdenes que tienen intermediario: al guardar o refrescar, lo que ves queda más alineado.',
    'Detalle de movimientos un poco más claro para seguir cada operación.',
    'Varias correcciones recientes ya están en esta versión; seguiremos con ajustes puntuales en los próximos envíos.',
  ],
};
