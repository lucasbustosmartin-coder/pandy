/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.8',
  lines: [
    'En órdenes cheque en pesos con intermediario, diferencias de centavos frente a la plantilla ya no se toman como si hubieras cambiado todo a mano: se comparan los importes en pesos enteros.',
    'Multicontraparte solo puede quedar activo de forma automática si en la práctica cambian pagador o cobrador respecto de lo esperado; marcar las transacciones como ejecutadas no debería activarlo solo.',
    'Al cerrar la instrumentación de ese tipo de cheque, el respeto del acuerdo vuelve a alinearse con lo que ves en pantalla, sin mensajes de exceso por sumar de más las patas con el intermediario.',
  ],
};
