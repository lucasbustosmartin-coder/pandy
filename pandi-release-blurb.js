/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 * `lines: []` = despliegue silencioso: no hay cartel de novedades al recargar (el login no espera Entendido).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.27',
  lines: [
    'Más seguridad al actualizar cuenta corriente y cajas: si la conexión falla a mitad de camino, la app avisa y no aplica cambios incompletos.',
    'Si Refrescar no puede completarse, ahora lo indica en lugar de mostrar «actualizada».',
  ],
};
