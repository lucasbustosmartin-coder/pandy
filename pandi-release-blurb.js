/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.17',
  lines: [
    'Hotfix de Sincronización Automática: Se corrigió una interrupción en el motor que causaba que la cuenta corriente se mostrará en blanco o solo con transacciones manuales. El panel vuelve a la normalidad y procesa exitosamente los registros históricos sin perder su trazabilidad de autoría.',
  ],
};
