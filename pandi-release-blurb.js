/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.8.0',
  lines: [
    'En Cuenta corriente → Movimientos, al exportar a Excel ves columnas Libro y Entidad (cliente o intermediario y el nombre), y una solapa aparte con movimientos anulados que no suman al saldo.',
    'En la vista Cliente, el detalle de movimientos coincide con Saldos: no se mezclan filas del cliente vinculado uno a uno con el intermediario.',
    'Ajustes en cómo se arman los movimientos de acuerdo cuando hay cobro al cliente y entrega hacia el cliente en la misma operación, para que el libro quede más claro y estable al sincronizar.',
  ],
};
