/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.44',
  lines: [
    'Al refrescar la cuenta corriente, las comisiones del acuerdo pueden pasar a cerrado cuando toda la instrumentación ya está ejecutada (antes podían quedar colgadas en pendiente).',
    'Misma lógica para el detalle que ves en Total: el saldo y los movimientos vuelven a alinearse con el acuerdo terminado.',
  ],
};
