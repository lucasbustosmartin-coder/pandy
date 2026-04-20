/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.63',
  lines: [
    'En pantallas de administración interna, los listados y el Excel muestran el número de orden y de transacción como en el día a día operativo, para leer más rápido sin códigos técnicos largos.',
    'Cuando un registro está ligado a una orden, podés abrir desde el listado una vista de solo lectura con el detalle vigente de esa orden en el servidor.',
    'Ajustes de maquetación en modales anchos para aprovechar mejor el espacio en pantallas grandes.',
  ],
};
