/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.6.3',
  lines: [
    'En Cuenta corriente → Saldos podés acotar la lista escribiendo parte del nombre; los totales y el Excel siguen lo que ves en pantalla.',
    'El export de saldos usa el mismo encabezado de auditoría que el resto de exportaciones a Excel.',
    'Las columnas de moneda quedan en un solo orden en toda la cuenta corriente: dólares, pesos y euros.',
  ],
};
