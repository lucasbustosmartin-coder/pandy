/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.55',
  lines: [
    'Cuenta corriente: reglas y migraciones SQL para cruces con intermediario (patrón ci_pc) cuando el acuerdo ya está ejecutado en ambas patas; conviene ejecutar los scripts indicados en Supabase y resincronizar la orden si ves el aviso de saldo.',
    'Documentación de requisitos Supabase, bitácora y pruebas al día; otros ajustes internos de sync CC, G/P operativa y clasificación de movimientos.',
  ],
};
