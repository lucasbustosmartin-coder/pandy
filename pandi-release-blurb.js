/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.45',
  lines: [
    'En cuenta corriente, si elegís «Cliente», ya no aparece quien comparte registro con un intermediario: evita ver saldos distintos a la vista unificada.',
    'Usá «Intermediario» o «Total» para ver a esa persona con todos sus movimientos juntos, en Saldos y en Movimientos.',
  ],
};
