/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En despliegue: igualar `versionLabel` al `#sidebar-version` y `lines` según bitácora-tareas.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.5.8',
  lines: [
    'Instrumentación manual multicontraparte disponible en todos los tipos de operación (N pagos y contrapartes explícitas).',
    'Al cerrar el acuerdo en ese modo, los totales cuentan todos los ingresos en moneda recibida y todos los egresos en moneda entregada, también si Pandy figura como pagador en un ingreso.',
  ],
};
