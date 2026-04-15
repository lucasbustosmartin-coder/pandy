/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.37',
  lines: [
    'Las ayudas de G/P Operativa en el panel de inicio cuentan con más detalle cuando la comisión del acuerdo se reparte entre la empresa y el intermediario en la misma orden y moneda.',
    'Los textos «?» junto a las filas de comisión del acuerdo aclaran qué queda en la fila de la empresa y qué puede seguir figurando para el intermediario (por ejemplo otra moneda o tasa).',
    'El manual de usuario describe el mismo criterio para leer el total sin confusiones.',
  ],
};
