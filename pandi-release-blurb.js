/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.3',
  lines: [
    'En cuenta corriente, órdenes en dólares con intermediario muestran el detalle de la entrega alineado al acuerdo al sincronizar.',
    'Corrección al ver movimientos cuando el acuerdo tiene distinto importe recibido y entregado en la misma moneda.',
    'Menos avisos de error al guardar o actualizar la cuenta en esos casos.',
  ],
};
