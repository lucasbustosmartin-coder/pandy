/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.13',
  lines: [
    'Protección Integral de Trazabilidad Histórica: Hemos implementado una auditoría de fondo que erradica la posibilidad de que una sincronización automatizada (ya sea de Cuentas Corrientes, Comisiones o Caja) herede accidentalmente tu usuario de sesión. Todo el legado y registro de datos es ahora 100% inalterable y fiel al autor original.',
  ],
};
