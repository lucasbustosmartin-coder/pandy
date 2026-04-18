/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.53',
  lines: [
    'Al actualizar o re-sincronizar la cuenta corriente de una orden, las transacciones anuladas vuelven a dejar registro en el libro cuando antes podía faltar una línea.',
    'Con eso, el informe de Control de calidad y la cuenta corriente coinciden mejor después de guardar o refrescar.',
  ],
};
