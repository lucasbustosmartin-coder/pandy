/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.33',
  lines: [
    'Al entrar a Instrumentación o desplegar Transacciones, si la app arma sola las filas sugeridas verás un aviso claro de espera y, al terminar, la pantalla se acomoda para que la tabla quede bien a la vista.',
    'Más espacio vertical en el paso Instrumentación del modal de orden para leer mejor el acuerdo y las transacciones.',
    'Corrección al generar la instrumentación sugerida en operaciones cheque en pesos con intermediario.',
  ],
};
