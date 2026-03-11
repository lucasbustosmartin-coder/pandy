# Permisos por opción de menú

La visibilidad y la transaccionalidad de cada sección de la app (incluido Cajas) deben configurarse desde los permisos de usuario. En Seguridad, los permisos están reorganizados por opción de menú: **Ver** (acceso a la vista e información) y **Operar** (crear, editar o anular), con leyendas claras desde `app_permission`.

## Situación actual

- **Permisos de vistas:** lista plana (`ver_inicio`, `ver_ordenes`, `ver_cajas`, `ver_clientes`, etc.).
- **Permisos ABM:** lista plana (`abm_clientes`, `abm_movimientos_caja`, `ingresar_orden`, etc.).
- En Seguridad se muestran dos bloques por rol: “Permisos de vistas” y “Permisos de alta, baja o modificación”, con un checkbox por permiso.

## Propuesta: agrupar por ítem de menú

Reorganizar la UI de permisos para que, dentro de cada rol, se vea **una sección por opción de menú** y en cada una:

- **Ver (on/off):** acceso a la vista y a la información.
- **Operar (on/off):** permitir crear/editar/anular según corresponda (transaccionalidad).

Ejemplo conceptual:

| Menú           | Ver        | Operar / ABM                                                                 |
|----------------|------------|-------------------------------------------------------------------------------|
| Panel de Control | ver_inicio | (solo lectura; sub-opciones ver_inicio_efectivo, ver_inicio_banco, ver_inicio_pendientes si se desea granularidad) |
| Órdenes        | ver_ordenes | ingresar_orden, editar_orden, anular_orden, editar_estado_orden               |
| Cajas          | ver_cajas  | abm_movimientos_caja, abm_tipos_movimiento_caja                               |
| Clientes       | ver_clientes | abm_clientes                                                                 |
| Cuenta corriente | ver_cuenta_corriente | (editar movimientos según permisos de órdenes/transacciones)              |
| Seguridad      | ver_seguridad | assign_roles                                                                |

Ventajas:

- Un solo lugar por menú para activar/desactivar “ver” y “operar”.
- La información y la transaccionalidad de Cajas (y del resto) se controlan desde el mismo panel de permisos por rol.

## Implementación sugerida

1. **Base de datos:** no es obligatorio cambiar el modelo; se pueden seguir usando `app_permission` y `app_role_permission`. La reorganización es sobre todo de **presentación** en la pantalla de Seguridad.
2. **Frontend (Seguridad):** en lugar de dos listas (vistas y ABM), renderizar **por ítem de menú** (Inicio, Órdenes, Cajas, Clientes, Cuenta corriente, Seguridad). En cada ítem:
   - Un toggle “Ver” que mapee al permiso `ver_*` correspondiente.
   - Un toggle “Operar” (o varios si hace falta granularidad) que mapee a los permisos ABM de ese menú.
3. **Menú lateral:** seguir ocultando ítems según los permisos `ver_*` del usuario; los botones de “Nuevo / Editar” se muestran según los permisos ABM correspondientes (como hoy).

Cajas y el resto de vistas siguen respetando `ver_cajas` para ver la información y `abm_movimientos_caja` (y `abm_tipos_movimiento_caja`) para la transaccionalidad; el menú lateral y los botones de acción siguen usando los mismos permisos.
