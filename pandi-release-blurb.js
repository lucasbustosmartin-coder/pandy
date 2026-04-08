/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.6.4',
  lines: [
    'Al guardar una orden nueva hay que elegir siempre un cliente en Participantes; sin cliente la app no deja guardar ni en la cola local.',
    'La ayuda del paso Participantes aclara que el intermediario se suma solo cuando el tipo de operación lo pide.',
    'Así el listado de órdenes y los reportes quedan alineados con un cliente asignado en cada orden.',
  ],
};
