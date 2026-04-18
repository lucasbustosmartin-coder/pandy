/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.50',
  lines: [
    'Cuenta corriente: al cerrar acuerdos en la misma moneda con intermediario, el resumen y el guardado deberían quedar coherentes sin quedarte a medias.',
    'Si invertís el ingreso en una operación dólar–dólar con intermediario, el sistema valida mejor el saldo y evita guardar datos incompletos.',
    'Menos mensajes de error confusos al ejecutar la segunda transacción cuando todo está bien instrumentado.',
  ],
};
