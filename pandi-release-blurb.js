/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.16',
  lines: [
    'En G/P Operativa, el período Total ahora muestra todo el historial sin cortarse a mitad de carga.',
    'El listado de movimientos de cada fila del G/P también abre más rápido, con los mismos importes de siempre.',
    'Día, semana y mes no cambian: solo se agiliza ver el acumulado desde el inicio.',
  ],
};
