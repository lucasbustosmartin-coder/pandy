/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.66',
  lines: [
    'En Cuenta corriente → Movimientos, la barra de filtros queda más clara en una línea: los botones muestran solo el ícono y al pasar el mouse ves qué hace cada uno.',
    'Podés acotar la lista por número de orden; al exportar a Excel, el nombre del archivo indica si estabas viendo Cliente, Intermediario o Total, tanto en Saldos como en Movimientos.',
  ],
};
