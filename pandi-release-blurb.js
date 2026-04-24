/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.4',
  lines: [
    'Desde Cuenta corriente → Saldos (clientes) podés generar un informe en PDF por período, con fechas y saldo inicial opcional.',
    'En el panel, G/P Operativa muestra primero el resultado devengado (libro y caja por órdenes) y aparte la caja manual, con textos de ayuda más claros.',
  ],
};
