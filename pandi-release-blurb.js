/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.36',
  lines: [
    'En Órdenes y en Cajas → Movimientos podés ordenar la tabla tocando el título de cada columna, igual que en Cuenta corriente.',
    'Al exportar movimientos de caja a Excel, el archivo respeta el mismo orden que ves en pantalla.',
    'Corregimos el orden en el listado de órdenes para que el clic en los encabezados funcione bien.',
  ],
};
