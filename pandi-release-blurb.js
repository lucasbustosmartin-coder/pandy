/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.34',
  lines: [
    'En el Panel, G/P Operativa ahora muestra seis bloques claros (caja manual, caja por órdenes, CC clientes, CC intermediarios y comisión del acuerdo para la empresa y para el intermediario) y el Total los suma sin mezclar lo mismo dos veces.',
    'Las ayudas de cada fila explican qué entra en cada bloque y por qué la comisión del acuerdo va aparte del resto del flujo.',
    'Si usás comisión del intermediario solo por transferencia (sin billetes), el sistema ya no inventa un movimiento de caja físico por esa comisión.',
  ],
};
