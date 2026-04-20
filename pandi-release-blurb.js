/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.57',
  lines: [
    'Cuenta corriente (dólar con intermediario): al invertir un cobro y usar compensación por saldo, el tope del importe ya no se queda enganchado solo en el monto de entrega cuando el acuerdo tiene diferencia con el recibido.',
    'Seguís viendo mejor el detalle de movimientos y las leyendas de compensación; conviene refrescar Cuenta corriente tras actualizar.',
  ],
};
