/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.19',
  lines: [
    'Hotfix Atribución CC (v3.7.19): Se corrigió la lógica del motor de reconstrucción que asignaba de forma incorrecta el "autor de la última transacción ejecutada" (ej. LMB) a movimientos residuales de la Cuenta Corriente. A partir de ahora, todo saldo histórico o pendiente se atribuye y blinda siempre usando el creador original de la orden, respetando tus arreglos de bases de datos.',
  ],
};
