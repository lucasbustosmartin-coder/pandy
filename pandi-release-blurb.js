/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.2',
  lines: [
    'Cuenta corriente, Inicio y Cajas: si acabás de alinear todo, la app no vuelve a disparar el mismo proceso pesado al instante al cambiar de pantalla.',
    'Después de iniciar sesión, la primera pantalla que abrís tiene prioridad para cargar; el alineado general de órdenes espera unos segundos para no competir con esa carga.',
    'Al actualizar la cuenta corriente de muchas órdenes, la app reutiliza un momento las mismas reglas de negocio para sentirse más fluida.',
    'Si agregás Pandi a la pantalla de inicio del celular, mejor compatibilidad con los navegadores actuales.',
  ],
};
