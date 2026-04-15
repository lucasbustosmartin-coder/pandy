/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.42',
  lines: [
    'En órdenes dólar–peso (o peso–dólar) sin intermediario, la cuenta corriente muestra bien las dos patas cuando una instrumentación queda a medias: menos avisos en rojo al guardar.',
    'El movimiento de la entrega acordada queda con el mismo criterio de signo que un pago realizado (importe en negativo donde corresponde).',
    'Ajustes en la documentación de reglas e instrumentación para quien opera el día a día.',
  ],
};
