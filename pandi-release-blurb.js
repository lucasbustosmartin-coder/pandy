/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.11',
  lines: [
    'Corrrección en trazabilidad de Cuentas Corrientes: solucionamos una inconsistencia técnica por la cual operaciones antiguas registraban al usuario en línea en lugar del responsable original de la transacción. ¡Ahora la atribución histórica es inmutable y 100% fidedigna!',
  ],
};
