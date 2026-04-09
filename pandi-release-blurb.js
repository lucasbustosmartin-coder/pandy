/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.4',
  lines: [
    'Potenciamos el motor de la aplicación: ahora Pandi carga de manera ultra rápida en tu celular y consume muchos menos recursos.',
    'Optimizamos las descargas de Excel. El módulo se activa en segundo plano solo cuando lo necesitas, agilizando tu pantalla principal.',
    'Aplicamos mejoras visuales de compresión que aligeran drásticamente el peso del sistema, cuidando tus datos y batería.'
  ],
};
