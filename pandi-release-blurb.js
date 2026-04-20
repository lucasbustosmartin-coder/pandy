/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.61',
  lines: [
    'Mejoras de estabilidad en cuenta corriente para acuerdos dólar–peso (o peso–dólar) con intermediario en el patrón habitual: el resumen deja de alternar filas al sincronizar.',
    'Si notabas que el saldo “iba y volvía”, actualizá la app o recargá con la nueva versión; el comportamiento queda alineado con lo acordado para el libro del cliente con Pandy.',
  ],
};
