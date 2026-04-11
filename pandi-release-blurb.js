/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.18',
  lines: [
    'Hotfix Multicontraparte (v3.7.18): Se corrigió un bug nativo en el motor que forzaba el usuario del "creador de la orden" en lugar del "ejecutor" al recalcular los movimientos CC Multicontraparte Manual (iconito 👥). Pandy ahora es 100% determinista y blinda a rajatabla tus arreglos SQL históricos.',
  ],
};
