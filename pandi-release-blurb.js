/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.30',
  lines: [
    'En Órdenes y en Órdenes pendientes (desde Inicio) ves en la tabla las comisiones de la empresa y del intermediario, por moneda, sin abrir cada acuerdo.',
    'Nuevo botón Exportar: bajás un Excel con el mismo listado y filtros que tenés en pantalla, listo para sumar o filtrar importes.',
  ],
};
