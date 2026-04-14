/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.32',
  lines: [
    'Cajas → Movimientos: la grilla se lee mejor con scroll horizontal; la columna Concepto ya no queda aplastada y las primeras columnas hasta Tipo quedan fijas al desplazar.',
    'Órdenes: las primeras columnas (número, fecha, tipo de operación y cliente) quedan visibles al moverte de lado en tablas anchas.',
    'En listados donde figura quién cargó o registró algo, todos los usuarios ven el nombre o el correo de la persona, no un código interno.',
  ],
};
