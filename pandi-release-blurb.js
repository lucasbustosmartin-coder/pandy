/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` al texto de `#sidebar-version` (cabecera de la app) y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.11',
  lines: [
    'Si olvidaste la contraseña, desde el inicio de sesión podés pedir un enlace por email y elegir una clave nueva; una vez adentro, también podés cambiarla desde el menú Cuenta.',
    'La cabecera quedó más clara: la versión de la app se ve debajo del logo, el botón Actualizar está al lado del menú Cuenta, y ahí concentrás email, nombre en listados, contraseña y cerrar sesión.',
    'Revisá en Supabase (Auth → URL configuration) que tu sitio esté en Redirect URLs si usás recuperación por mail, como indica la guía de requisitos.',
  ],
};
