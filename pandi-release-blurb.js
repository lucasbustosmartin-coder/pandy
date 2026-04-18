/**
 * Única fuente del texto de novedades para el modal «Nueva versión» (PWA / navegador).
 * En cada «ok desplegar» lo actualiza el agente (Cursor): igualar `versionLabel` a `#sidebar-version` y redactar `lines`
 * según bitacora-tareas — en el flujo normal **no hace falta que edites este archivo** a mano.
 * El build genera `dist/pandi-release.json` para leerlo con red (no queda atrapado en el bundle viejo del SW).
 */
export const PANDI_RELEASE_BLURB = {
  versionLabel: 'v3.7.54',
  lines: [
    'En Seguridad (solo administradores) podés ajustar cuántas filas pide la app en cada consulta cuando los listados son muy grandes, para acelerar la carga si tu entorno lo permite.',
    'Después de guardar ese valor, recargá la página para que toda la app use el nuevo tamaño en cuenta corriente y en el resto de las lecturas masivas.',
  ],
};
