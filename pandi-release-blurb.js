/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.5',
  lines: [
    'Cuenta corriente con intermediario: al sincronizar, la comisión del acuerdo en el libro del intermediario queda con el signo acordado (siempre en negativo, como el resto del flujo).',
    'G/P operativa: el panel y el detalle por bolsa reflejan mejor el reparto entre libro, caja por órdenes y caja manual según lo que venís operando.',
  ],
};
