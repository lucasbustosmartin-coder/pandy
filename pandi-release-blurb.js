/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.6.2',
  lines: [
    'En G/P Operativa, el detalle de las cuatro filas de la matriz usa la columna «Medio de pago» de forma uniforme.',
    'Caja manual: ves Efectivo, Banco o Cheque según cómo cargaste cada movimiento; caja por órdenes y cuenta corriente muestran el modo cuando la línea viene de una transacción.',
  ],
};
