/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.12',
  lines: [
    'Corrrección extendida en trazabilidad: Solucionamos el inconveniente visual que asignaba temporalmente el autor en sesión a los movimientos pendientes. Ahora las proyecciones visuales de Cuenta Corriente heredan fidedignamente al autor de la orden.',
  ],
};
