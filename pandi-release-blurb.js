/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.38',
  lines: [
    'En Órdenes y en el listado de órdenes pendientes del inicio aparece la columna Multi: ves de un vistazo si la orden usa multicontraparte manual (Sí o No) con etiquetas de color y una ayuda «?» en el encabezado.',
    'Podés ordenar por Multi y exportar a Excel con la misma información; si la base aún no expone el dato enlazado, la lista sigue cargando sin bloquearse.',
  ],
};
