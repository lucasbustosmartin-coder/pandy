/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.2',
  lines: [
    'En Cuenta corriente el saldo por moneda incluye también lo pendiente (nunca lo anulado), igual en Saldos, Movimientos y al abrir el detalle con el ojo.',
    'En ese detalle verás un subtotal aparte de «Saldo pendiente» en las tarjetas y al pie de la tabla de movimientos.',
    'La vista Cuenta corriente suele abrir más rápido al volver al menú en la misma sesión; si querés forzar un recálculo completo, usá Refrescar.',
  ],
};
