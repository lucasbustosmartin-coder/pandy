/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.27',
  lines: [
    'En el celular, la barra superior (correo, nombre y acciones) queda más clara y ordenada.',
    'G/P Operativa y la tabla de Saldos en cuenta corriente permiten deslizar horizontalmente cuando los importes son largos, sin amontonarlos.',
    'Guía de pruebas móvil/PWA en docs y comando npm run dev:host para probar en la red local si lo necesitás.',
  ],
};
