/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.9',
  lines: [
    'Actualización en calculadora USD-USD con intermediario: en el modo "Incremento", el Monto a Recibir ahora incorpora efectivamente el porcentaje indicado y el Monto a Entregar iguala estrictamente al importe base transaccionado.',
  ],
};
