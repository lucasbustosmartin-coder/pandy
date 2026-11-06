# Auditoría de acciones de usuario (`auditoria_app`)

La tabla **`auditoria_app`** (ver `sql/migracion_cc_manual_editar_eliminar_auditoria.sql`) registra acciones sensibles de **usuarios individuales**. El INSERT es **best-effort** (`void` + fallo silencioso): si la tabla no existe o RLS rechaza, **no se bloquea** el guardado de negocio.

Las **ediciones** que modifican datos persistidos incluyen, en **`metadata` (JSON)**, un arreglo **`cambios`** para consultas y revisiones sin depender solo del texto de `detalle`. Las **altas** (crear) usan acción **`alta`** y metadata de contexto (ids, importes, origen); no reescriben el libro de CC/caja.

## Usuario

- **`usuario_id`** (columna de la fila): UUID del usuario autenticado que ejecutó la acción (`auth.users`), igual que en el `INSERT` desde la app.
- **`metadata.usuario_snapshot`**: opcional, objeto `{ usuario_email, usuario_display_name }` cuando la sesión tiene esos datos (barra superior / perfil).

## Formato de `metadata.cambios`

Cada elemento es un objeto con:

| Clave      | Tipo   | Significado                          |
|-----------|--------|--------------------------------------|
| `campo`   | string | Nombre lógico del dato modificado    |
| `anterior`| JSON   | Valor antes del guardado (nullable)  |
| `nuevo`   | JSON   | Valor después del guardado           |

Otros campos frecuentes en `metadata` (según el flujo):

- `entidad`: p. ej. `transaccion`, `orden`, `cc_manual`, `movimiento_caja`.
- `registro_id`, `orden_id`, `transaccion_id`, `instrumentacion_id`, `movimiento_caja_id`: identificadores en string cuando aplica.
- **`orden_numero`** y **`transaccion_numero`**: números de negocio visibles (no solo UUID). Se persisten al insertar en `auditoria_app` (enriquecimiento automático antes del `INSERT` desde `main.js`). Las filas antiguas sin estos campos se completan en memoria al listar/exportar cuando hay `orden_id` / `transaccion_id`.

## Altas de acciones de usuario (`main.js`)

Quedaban fuera las **creaciones**. El front las registra **después** de un INSERT exitoso (no cambia el flujo de negocio). **No** se audita como alta de usuario: borrador de orden que se borra al cerrar; movimientos CC/caja **derivados** del sync (eso es `cc_caja_sync`); permisos, empresa ni cambio de contraseña.

| Categoría / acción | Cuándo |
|--------------------|--------|
| `orden` / `alta` | Crear orden (wizard, guardar, cola offline). Metadata: cliente, intermediario, tipo, montos, `origen` (`manual` / `cola_offline`). |
| `transaccion` / `alta` | Nueva transacción: modal, plantilla de instrumentación, split, ganancia Pandy, compensatoria, cola offline. Metadata: tipo, moneda, monto, `origen`. |
| `orden` / `comisiones` | Grabar filas de `comisiones_orden` (wizard, guardar, cola). |
| `cc_manual` / `alta` | Nuevo movimiento manual de CC (online y cola offline). Distinto de **editar** (modal propio de reemplazo). |
| `caja_manual` / `alta` | Nuevo movimiento de caja (Cajas → Nuevo; cola offline). |
| `cliente` / `alta` · `editar` | ABM clientes (alta, guardar, toggle activo). El vínculo cliente↔intermediario va en metadata. |
| `intermediario` / `alta` · `editar` | ABM intermediarios (igual). |
| `tipo_operacion` / `alta` · `editar` | ABM tipos de operación, toggles y reorden visual. |
| `tipo_caja` / `alta` · `editar` | ABM tipos de movimiento de caja, activo e incluye G/P. |

## Flujos que registran `cambios` (`main.js` y RPC `sync_cc_caja_orden`)

| Categoría / acción (ejemplos)     | Cuándo |
|-----------------------------------|--------|
| `transaccion` / `editar`          | Guardar transacción desde el **modal** (UPDATE): diff de campos persistidos. |
| `transaccion` / `editar_monto`    | **Solo monto** desde la tabla de instrumentación (pendiente o ejecutada, incl. motor legacy). |
| `transaccion` / `editar_modo_pago`| **Solo modo de pago** (UPDATE `modo_pago_id`). En **`cambios`**: una fila **`modo de pago`** con códigos legibles (`modos_pago.codigo`). En **metadata** (raíz, por el spread de `extra`): `modo_pago_codigo_anterior`, `modo_pago_codigo_nuevo`, `modo_pago_id_anterior`, `modo_pago_id_nuevo` para trazabilidad técnica. El texto **`detalle`** incluye los códigos entre paréntesis. Registros viejos con solo `modo_pago_id` en `cambios` se muestran en el modal con códigos si existía `modo_pago_codigo_anterior` y/o `modo_pago_codigo_nuevo`. |
| `transaccion` / `cambiar_estado`  | Combo **pendiente ↔ ejecutada** (tras RPC `transacciones_cambiar_estado` o `UPDATE` fallback): estado, `fecha_ejecucion`, `usuario_id`, `revertida_una_vez` si aplica. |
| `orden` / `editar`                | **Guardar orden** (wizard y flujo «guardar orden»): diff de columnas de negocio respecto del snapshot **antes** del `UPDATE` y la fila **después** (relectura). |
| `orden` / `wizard_ajuste_desde_comision_usd` | Wizard **USD-USD**, campo **«Comisión a Recibir»** al confirmar (**change** / **blur**): se recalculó la **tasa al cliente** y los montos del acuerdo. **Sin** arreglo `cambios`: en **metadata** quedan `spread_usd`, `tasa_cliente_pct`, `modo_tasa`, `monto_recibido`, `monto_entregado`, `orden_id` (si la orden ya tiene id). El guardado posterior sigue generando `orden` / `editar` con diff de columnas persistidas. |
| `cc_manual` / `editar`            | **Editar movimiento manual de CC**: diff de roles, ids de contraparte, moneda, monto, modalidad, concepto, fecha, grupo. Si no hay diff de campos (caso límite), se mantiene un registro con metadata previa sin arreglo `cambios`. |
| `orden` / `anular`                | **Anular orden** (flujo unificado): **`detalle`** con quién, nro. de orden, transacciones, conteo de CC/caja y resultado de verificación. **`metadata.cambios`**: una fila por registro afectado (estado de la orden, cada transacción no anulada, cada movimiento CC derivado vivo cliente/intermediario, cada caja viva de la orden, comisiones del acuerdo eliminadas). **`metadata.registros`**: ids, montos, estado anterior. **`usuario_snapshot`**. `sync_ok`, `red_seguridad`, `verificacion_ok`. No reescribe órdenes anuladas de historial. |
| `cc_manual` / `anular`            | **Anular** movimiento(es) manual(es) de CC: **`detalle`** legible (moneda, importe formateado, fecha, concepto usuario, modalidad, pagador/cobrador con nombres de cliente/intermediario cuando hay red, cantidad de líneas del grupo, aviso si hubo caja vinculada). En **metadata** siguen `grupo_id`, `caja_id`, `filas` (referencia técnica) y opcionalmente `usuario_snapshot`. |
| `caja_manual` / `editar`          | **Editar movimiento de caja solo manual** (sin orden ni transacción): diff de moneda, monto, tipo, caja_tipo, concepto, fecha. |
| `cc_caja_sync` / `alta` · `editar` · `anular` | Lo escribe la RPC **`sync_cc_caja_orden`** (no el front) al persistir CC cliente, CC intermediario o caja **derivada**. **`detalle`** en español: libro, entidad, nro. de orden/transacción, importe con moneda, concepto y medio de pago. **`metadata`:** `entidad` (`cc_cliente` / `cc_intermediario` / `caja`), `libro`, `orden_numero`, `transaccion_numero`, `moneda`, `monto`, `medio_pago`, `caja` / `caja_tipo` si aplica, `registro_id` (id de la fila, no se borra). **`cambios`:** Estado, Monto, Moneda, Medio de pago, Caja, Concepto según el caso. Un huérfano **no se elimina**: queda `estado = anulado` y una fila de auditoría `anular`. |

Anulaciones y otros eventos pueden seguir usando solo `detalle` y metadata sin `cambios`; ver `docs/CC_MOVIMIENTO_MANUAL.md`.

## Consulta SQL (ejemplo)

```sql
select creado_en, usuario_id, categoria, accion, detalle, metadata
from public.auditoria_app
where categoria = 'transaccion' and accion = 'editar'
order by creado_en desc
limit 50;
```

Permiso **`ver_auditoria`** para `SELECT` vía RLS.

## Vista «Auditoría» en la app (admin)

- Menú lateral **Auditoría** (visible con permiso `ver_auditoria`): filtros por rango de fecha (Argentina), categoría (transacción, orden, CC/caja manual, **Cuenta corriente y caja** = `cc_caja_sync`, cliente, intermediario, tipo de operación, tipo de caja, app), acción y texto en detalle. Al **cambiar un filtro** el listado se recarga solo (el texto espera un instante al teclear; **Buscar** recarga al momento). La consulta es la misma de antes. Tabla con relectura paginada (**Cargar más**); columnas **Nº orden** y **Nº trans.** (números de negocio) a la derecha de **Categoría**; categorías y acciones se muestran con etiqueta legible (no el código interno; **Alta**, **Comisiones**); export a Excel incluye esas columnas; fila **Ver** abre modal de detalle; botón **Orden** (solo si el registro tiene contexto de orden o transacción) abre modal de **solo lectura** con orden + instrumentación + transacciones + comisiones al momento del clic. En el modal de `cc_caja_sync` el encabezado suma libro, caja, medio de pago y moneda.
- **Modal de detalle (lectura práctica):** bloque **Cuándo** (fecha y hora Argentina) y **Quién** (nombre o email desde `usuario_id` + `usuario_snapshot`); categoría y acción; descripción (`detalle`); tabla **Qué se modificó** con columnas **Campo**, **Nº orden**, **Nº trans.** (mismo contexto que el registro), **Valor anterior** y **Valor nuevo**. Los UUID de catálogos habituales (cliente, intermediario, tipo de operación, modo de pago, usuario, tipo de movimiento de caja, instrumentación→orden, orden) se **resuelven al abrir** contra Supabase y no se muestran como UUID en esa tabla; si no hay resolución, se muestra **—**. Estados, roles (pagador/cobrador), montos y fechas YYYY-MM-DD se formatean para lectura. El JSON completo queda en **Referencia técnica** (`<details>`, colapsado por defecto).
- Los refrescos en segundo plano del listado global de la app **no** vuelven a ejecutar la carga de esta vista (evita vaciar la grilla si el timer corre mientras estás en Auditoría).
