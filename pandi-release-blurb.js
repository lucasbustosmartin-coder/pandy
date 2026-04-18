/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.52',
  lines: [
    'El informe de Control de calidad ahora tiene en cuenta también las órdenes anuladas del período, para cruzar caja y cuenta corriente sin dejar huecos.',
    'Si una transacción quedó anulada, el informe puede avisarte si falta huella en cuenta corriente o si algún movimiento derivado no quedó alineado con el anulado.',
    'Actualizamos las ayudas en pantalla y el manual offline para leer mejor cada alerta.',
  ],
};
