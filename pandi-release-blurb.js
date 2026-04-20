/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.62',
  lines: [
    'En órdenes dólar–peso o peso–dólar sin intermediario, cuando Pandy cumple la entrega al cliente, en cuenta corriente vas a ver el par de movimientos en la moneda entregada (pago + ajuste libro), así el detalle de la orden suma cero en esa moneda.',
    'Si la instrumentación se ajustó a mano, la cuenta corriente sigue aplicando las reglas acordadas para la pata en moneda recibida (incluida la leyenda cuando Pandy cumple esa pata).',
  ],
};
