/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.59',
  lines: [
    'Cruce en dos monedas con instrumentación ajustada manual (badge Aj) y reglas: el sync vuelve a generar el par de cierre «Cierre orden» (+recibido en una moneda y −entregado en la otra) cuando hace falta, porque en ese modo el motor solo suma comisiones y no repone sola la pata intermediario→cliente en la cuenta del cliente.',
    'Se corrige un cambio previo que en ese caso dejaba solo el cobro en dólares sin la contrapartida libro en pesos.',
  ],
};
