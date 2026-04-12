/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.29',
  lines: [
    'Los filtros por cliente e intermediario en órdenes (lista principal y modal de pendientes) vuelven a coincidir bien con los datos.',
    'En los modales de pendientes, la tabla se puede desplazar en horizontal y en vertical cuando hace falta, cómodo en el celular en vertical.',
  ],
};
