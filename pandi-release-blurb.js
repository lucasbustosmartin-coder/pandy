/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.58',
  lines: [
    'Cuenta corriente con dólar–peso e intermediario (cobro a la empresa y entrega del intermediario al cliente): cuando todo quedó ejecutado, al refrescar la cuenta ya se alinean bien los estados de los movimientos.',
    'Si al pulsar Refrescar en Cuenta corriente algo no se puede actualizar, la app te avisa con un mensaje claro en lugar de dar por hecho que salió todo bien.',
  ],
};
