/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.22',
  lines: [
    'En instrumentación, los totales Recibido y Entregado y el cierre con «Listo» vuelven a coincidir con las transacciones ya ejecutadas, también en operaciones con intermediario.',
    'Se corrigió el aviso de «faltan ingresos o egresos» cuando el acuerdo ya estaba cubierto en pantalla.',
  ],
};
