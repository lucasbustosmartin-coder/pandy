/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.35',
  lines: [
    'G/P Operativa muestra el resultado de la empresa en el período: el Total suma caja ejecutada, cuenta corriente alineada a lo que ves en Saldos (incluye pendientes) y las comisiones del acuerdo sin contar lo mismo dos veces.',
    'La parte del acuerdo que corresponde al intermediario se resta del Total y las ayudas (incluida la fila Total) lo explican en simple.',
    'Actualizamos textos del manual y de la ayuda del Panel para que coincida con lo que hace la app al recargar.',
  ],
};
