/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.21',
  lines: [
    'Podés guardar órdenes donde el cliente y el intermediario son la misma persona vinculada en datos: ya no aparece el aviso que lo impedía al editar o crear.',
    'Las ayudas de Participantes (nueva orden) e Intermediarios explican cuándo usar ambos roles y cómo completar el vínculo si antes cargaste registros separados.',
    'El manual de uso offline y la documentación interna quedaron alineados con este criterio.',
  ],
};
