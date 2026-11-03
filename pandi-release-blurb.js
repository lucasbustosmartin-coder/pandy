/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.22',
  lines: [
    'Pasado el plazo de días hábiles, ya no se puede editar ni anular una orden ejecutada ni un movimiento manual (salvo el Administrador).',
    'El aviso indica contactar al Administrador del Sistema (Lucas Bustos).',
    'Al pulsar Refrescar, el Administrador elige si actualizar solo el plazo o toda la historia.',
  ],
};
