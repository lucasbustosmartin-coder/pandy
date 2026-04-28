/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.7',
  lines: [
    'En órdenes dólar–pesos y pesos–dólar, los montos en dólares del acuerdo admiten más decimales y el tipo de cambio los respeta al calcular el otro lado.',
    'En la instrumentación, los montos en dólares y en euros de las transacciones se muestran y pueden editarse con la misma precisión para que cierre con el acuerdo.',
    'Se corrigió el mensaje que a veces impedía marcar la orden como lista cuando los importes ya coincidían con el acuerdo.',
  ],
};
