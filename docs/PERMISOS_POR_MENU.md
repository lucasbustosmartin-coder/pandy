# Permisos por opción de menú

La visibilidad y la transaccionalidad de cada sección de la app (incluido Cajas) deben configurarse desde los permisos de usuario. En Seguridad, los permisos están reorganizados por opción de menú: **Ver** (acceso a la vista e información) y **Operar** (crear, editar o anular), con leyendas claras desde `app_permission`.

Quien tenga permiso de asignar roles puede **crear perfiles nuevos** (filas en `app_role`: código interno estable, p. ej. `empleado_comercial`, y nombre visible). Esos perfiles aparecen en la grilla «Permisos por perfil» **sin permisos** hasta activar los interruptores; luego se asignan usuarios en la tabla superior. Los tres roles base no se eliminan desde la UI; un perfil custom solo se puede borrar si **ningún usuario** lo tiene asignado (acción al pie del perfil expandido). Requisito en Supabase: `sql/migracion_app_role_gestion_assign_roles.sql` (o bootstrap actualizado).

**Panel de Control:** cada tarjeta de caja (Efectivo, Banco, Cheque) exige su permiso **`ver_cajas_efectivo`**, **`ver_cajas_banco`** o **`ver_cajas_cheque`**; ya no se muestran las tres juntas solo por tener `ver_cajas`. **G/P Operativa** sigue con **`ver_inicio_gp_operativo`**. Las tarjetas **Órdenes pendientes** y **Transacciones pendientes** tienen permisos separados: **`ver_inicio_ordenes_pendientes`** y **`ver_inicio_transacciones_pendientes`** (`sql/migracion_permisos_inicio_tarjetas_pendientes_split.sql` otorga ambos a quien ya tenía `ver_inicio_pendientes`). Sin migración, quien solo tenga `ver_inicio_pendientes` sigue viendo las dos tarjetas (compatibilidad). **Control de calidad** es un ítem de menú propio con **`ver_control_calidad`**; la migración `sql/migracion_control_calidad_vista_informe.sql` copia ese permiso a los roles que ya tenían **`ver_gp_operativo_control_calidad`** y reemplaza la RPC antigua por **`control_calidad_informe`** (el bloque de alertas ya no vive bajo G/P en Inicio).

## Situación actual

- **Permisos de vistas:** lista plana (`ver_inicio`, `ver_ordenes`, `ver_cajas`, `ver_clientes`, etc.).
- **Permisos ABM / operativos:** lista plana (`abm_clientes`, `alta_movimiento_caja`, `editar_movimiento_caja`, `anular_movimiento_caja`, `ingresar_orden`, etc.).
- En Seguridad se muestran dos bloques por rol: “Permisos de vistas” y “Permisos de alta, baja o modificación”, con un checkbox por permiso.

## Propuesta: agrupar por ítem de menú

Reorganizar la UI de permisos para que, dentro de cada rol, se vea **una sección por opción de menú** y en cada una:

- **Ver (on/off):** acceso a la vista y a la información.
- **Operar (on/off):** permitir crear/editar/anular según corresponda (transaccionalidad).

Ejemplo conceptual:

| Menú           | Ver        | Operar / ABM                                                                 |
|----------------|------------|-------------------------------------------------------------------------------|
| Panel de Control | ver_inicio | Tarjetas Efectivo / Banco / Cheque usan los mismos permisos que Cajas: **ver_cajas_efectivo**, **ver_cajas_banco**, **ver_cajas_cheque** (configurables en el bloque **Cajas** en Seguridad). Sub-opción **ver_inicio_pendientes** para órdenes y transacciones pendientes. Los permisos legacy `ver_inicio_efectivo` / `ver_inicio_banco` ya no gobiernan el panel en la app; migración opcional: `sql/migracion_panel_tarjetas_mismos_permisos_ver_cajas.sql`. |
| Órdenes        | ver_ordenes | ingresar_orden, editar_orden, anular_orden, editar_estado_orden               |
| Cajas          | ver_cajas  | alta_movimiento_caja, editar_movimiento_caja, anular_movimiento_caja, abm_tipos_movimiento_caja |
| Clientes       | ver_clientes | abm_clientes                                                                 |
| Cuenta corriente | ver_cuenta_corriente | registrar_movimiento_cc_manual, editar_movimiento_cc_manual, eliminar_movimiento_cc_manual |
| Seguridad      | ver_seguridad, ver_auditoria | assign_roles                                                                |

Ventajas:

- Un solo lugar por menú para activar/desactivar “ver” y “operar”.
- La información y la transaccionalidad de Cajas (y del resto) se controlan desde el mismo panel de permisos por rol.

## Implementación sugerida

1. **Base de datos:** no es obligatorio cambiar el modelo; se pueden seguir usando `app_permission` y `app_role_permission`. La reorganización es sobre todo de **presentación** en la pantalla de Seguridad.
2. **Frontend (Seguridad):** en lugar de dos listas (vistas y ABM), renderizar **por ítem de menú** (Inicio, Órdenes, Cajas, Clientes, Cuenta corriente, Seguridad). En cada ítem:
   - Un toggle “Ver” que mapee al permiso `ver_*` correspondiente.
   - Un toggle “Operar” (o varios si hace falta granularidad) que mapee a los permisos ABM de ese menú.
3. **Menú lateral:** seguir ocultando ítems según los permisos `ver_*` del usuario; los botones de “Nuevo / Editar” se muestran según los permisos ABM correspondientes (como hoy).

Cajas y el resto de vistas siguen respetando `ver_cajas` para ver la información; la transaccionalidad en caja usa `alta_movimiento_caja`, `editar_movimiento_caja` y `anular_movimiento_caja` (más `abm_tipos_movimiento_caja` para el catálogo). Los INSERT de caja ligados a órdenes/transacciones siguen permitidos por RLS con permisos de instrumentación. Migración SQL: `sql/migracion_permisos_movimientos_caja_granular.sql`.
