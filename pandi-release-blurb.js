/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.23',
  lines: [
    'Cuenta corriente: al sincronizar órdenes, los movimientos usan el mismo criterio de quién paga y quién cobra que el resto del flujo, incluso cuando en pantalla faltaban esos datos por completo.',
    'Así se evita el aviso de que «no hay regla» y la falta de movimientos cuando la operación sí era coherente; podés volver a refrescar CC y seguir con la orden.',
  ],
};
