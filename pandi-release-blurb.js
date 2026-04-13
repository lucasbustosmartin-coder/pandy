/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.31',
  lines: [
    'En Cuenta corriente podés elegir Total además de Cliente e Intermediario: los saldos muestran la posición consolidada sin contar dos veces a quien tiene «Mismo registro que…».',
    'En Movimientos, el listado incluye todo lo que corresponde y el filtro por entidad se adapta al modo Total.',
    'La búsqueda por nombre en Saldos también sirve cuando tenés seleccionado Total.',
  ],
};
