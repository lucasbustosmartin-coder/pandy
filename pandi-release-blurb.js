/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.17',
  lines: [
    'En Cuenta corriente → Movimientos, la columna Orden muestra el número real de la orden (ya no un guión).',
    'El Excel de esa pantalla exporta el mismo número de orden, alineado a lo que ves en pantalla.',
    'Los importes no cambian. Los movimientos manuales sin orden siguen mostrando un guión.',
  ],
};
