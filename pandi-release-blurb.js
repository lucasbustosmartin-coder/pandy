/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.3',
  lines: [
    'En órdenes USD–USD, en Datos del acuerdo podés elegir si la tasa al cliente es un descuento sobre lo recibido o un incremento sobre lo entregado: el importe sigue siendo lo que recibe el cliente y el monto a entregar se calcula según esa opción.',
    'La elección queda guardada en la orden para cuando la vuelvas a abrir o edites.',
    'Actualizamos textos de ayuda y el manual de uso offline con este criterio.',
  ],
};
