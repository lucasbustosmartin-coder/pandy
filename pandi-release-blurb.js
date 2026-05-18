/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.13',
  lines: [
    'En órdenes **cheque en pesos con intermediario**, si invertís quién paga y quién cobra en la transacción del cliente (como en dólar–dólar con intermediario), la cuenta corriente y los movimientos se actualizan con el mismo criterio, sin el aviso que bloqueaba el guardado.',
    'Corrección al guardar una transacción desde el formulario cuando la orden ya estaba cargada en memoria.',
  ],
};
