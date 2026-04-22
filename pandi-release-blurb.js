/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.1',
  lines: [
    'Cuenta corriente: al reabrir o sincronizar ciertas órdenes en dólar–peso con intermediario, el registro de movimientos vuelve al criterio anterior al de la última actualización, para alinear saldos con lo que ya tenías.',
    'El export de Movimientos a Excel sigue igual: columnas Libro y Entidad, y movimientos anulados en su propia solapa.',
  ],
};
