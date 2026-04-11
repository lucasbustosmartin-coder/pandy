/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.16',
  lines: [
    'Corrección Invisible de Autoría: Se identificó y resolvió una falla estructural en las consultas JavaScript donde se ignoraba la descarga de la columna `p_usuario_id`. Ahora el sistema de reportes en cuenta corriente rastrea perfectamente al autor real del movimiento en Supabase, evitando la autoasignación ("LMB" u otros propios) a registros generados en segundo plano ("Compromiso de Pago" o "Cobro Realizado").',
  ],
};
