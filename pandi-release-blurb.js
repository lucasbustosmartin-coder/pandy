/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 * `lines: []` = despliegue silencioso: no hay cartel de novedades al recargar (el login no espera Entendido).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.25',
  lines: [
    'Los filtros de listados se marcan cuando están en uso, para ver de un vistazo qué está recortando la pantalla.',
    'En cuenta corriente y cajas, el botón elegido (tipo, moneda, hoy o historial) queda resaltado.',
    'En G/P Operativa y Control de calidad, el período seleccionado se ve más claro.',
  ],
};
