# Incidente: saldo inicial de caja ARS y cuentas corrientes — sync del 19/11/2026

Investigación 2026-11-20 (solo lectura en Pandy). **Estado:** protección (B1 servidor G1 bloqueante + G2/G3 alerta; B2 front fail-closed) lista y probada en Pandy-Dev (`sql/migracion_sync_cc_caja_guarda_anti_vaciado.sql`, v3.8.27); corrección A lista (`sql/correccion_incidente_sync_20261119_ordenes_150_152.sql`). Pendiente aplicar en prod (regla: sin sesiones de otros usuarios).

## Resumen

El 19/11/2026 entre **17:34 y 17:43** (hora AR), un usuario con rol *empleado administrativo* disparó una sincronización de CC/caja (sync global de login/Inicio/Cajas seguido de Refrescar en lotes). Las **lecturas previas vinieron incompletas** y el sistema:

1. **Anuló movimientos válidos** de dos órdenes ejecutadas sin cambios desde el 30/04 → **error del sistema**.
2. **Anuló movimientos fantasma** que seguían vivos de órdenes anuladas hace meses → **corrección legítima** (el saldo nuevo es el real).
3. Insertó ~300 filas de CC **ya anuladas** de órdenes anuladas → sin efecto en saldos, solo ruido en auditoría.

**No fue error de carga del usuario.**

## 1. Caja ARS efectivo — saldo inicial

| | Importe |
|---|---:|
| Saldo inicial 20/11 que muestra la app | 9.628.170 |
| Saldo inicial 20/11 reconstruido | **6.858.170** (coincide con el "≈ 6 M" del usuario) |
| Diferencia | **+2.770.000** |

Causa: el 19/11 17:34:57 el sync anuló el **egreso efectivo ARS −2.770.000 de la orden 152 (trx 342, fecha 30/04)** y no lo reemplazó (movimiento `162dbac2-3efa-4ecc-ae6d-d6e751622988`). Afecta el saldo de **todos los días desde el 30/04**. Es la única transacción ejecutada en efectivo sin movimiento de caja vivo. Banco y cheque ARS: sin diferencias por este incidente.

Saldo inicial reconstruido (efectivo ARS), para control con el usuario:

| Día | App hoy | Real |
|---|---:|---:|
| 13/11 | 6.629.170 | 3.859.170 |
| 17/11 | 11.379.170 | 8.609.170 |
| 19/11 | 10.471.170 | 7.701.170 |
| 20/11 | 9.628.170 | 6.858.170 |

## 2. Cuentas corrientes reportadas

**Error del sistema (órdenes ejecutadas vaciadas):**

| Persona | Orden | Qué se anuló | Efecto |
|---|---|---|---|
| As Sports (cliente) | 152 (30/04, USD-ARS) | +2.000 USD (y par ARS neto 0) | saldo −2.000 USD |
| Rou (intermediario) | 150 (30/04, USD-USD) | +34.990 USD | saldo −34.990 USD |
| Martucci (cliente, no reportado) | 150 | −34.990, +34.990, −34.465,15 USD | saldo +34.465,15 USD |

**Corrección legítima (fantasmas de órdenes anuladas):**

| Persona | Orden anulada | Fantasma retirado |
|---|---|---|
| Pavan | 491 (07/07) | −3.900 USD |
| Seoane | 554 (22/07) | −8.990 USD |
| Guido | 646 (05/08), 779 (26/08) | −4.655,50 USD; −1.900.000 ARS |
| Julián (intermediario) | 646 | +4.775,50 USD |
| Brown (no reportado) | 827 (02/09) | −55.520 USD |

Sin duplicados vivos en CC cliente, CC intermediario ni caja.

## 3. Causa raíz (código)

- `pandiSupabaseFetchAll` devuelve datos parciales con error (`main.js:548`); el prefetch de Refrescar los acepta / saltea tandas (`main.js:17685`, `17713`) y `sincronizarCcYCajaDesdeOrden` ignora errores de lectura de transacciones (`~main.js:29988`).
- El filtro de órdenes anuladas / fuera de plazo depende de una lectura en tandas con `break` ante error (`main.js:17929`): órdenes no leídas se sincronizan igual (por eso entraron órdenes anuladas).
- Una orden ejecutada termina con payload vacío y la RPC `sync_cc_caja_orden` **anula como huérfanas todas sus filas vivas** (`sql/rpc_sync_cc_caja_orden.sql:836`), sin validar contra el estado real de las transacciones.
- No existe cierre de día ni guarda en servidor; hay DELETE físicos en caja sin rastro (`main.js:23063, 23319, 31091, 31293, 31543, 33976, 35048, 35789`).

## 3b. Hueco del plazo de seguridad

El Refrescar «Toda la historia» es solo Admin y **no** se usó. El sync automático (login/Inicio/Cajas) de un empleado aplica el plazo filtrando por el estado de las órdenes, pero si esa lectura fallaba hacía `break` y **las órdenes no leídas se sincronizaban igual** (sin plazo y sin excluir anuladas). Corregido en v3.8.27: ante error se cancela todo el sync y solo se procesan órdenes cuyo estado se leyó.

## 4. Por qué la auditoría no alcanzó

- La anulación por sync de una fila viva se registra a veces como **"editar"** (cambio de estado dentro de `cambios`), no como "anular".
- No guarda la **fecha contable** del movimiento ni el **proceso de origen** (login, Refrescar, abrir orden, ejecutar transacción); el usuario es quien tenía la sesión abierta.
- `cambios` lista campos sin cambio (ruido); "anterior: cerrado" fijo.
- DELETE físicos y varias altas/ediciones de caja desde el front no se auditan; los fallos de auditoría se ignoran; el log se puede borrar con SQL.
- La pantalla no filtra por caja, moneda, fecha contable, usuario ni orden; muestra JSON y jerga.

## 5. Propuestas (requieren acuerdo)

### A. Corrección de datos (dev → prod)
Re-crear como **filas nuevas vivas** (sin reabrir anulados, libro sin DELETE) los 8 movimientos anulados el 19/11 17:34–17:35 de las órdenes **150 y 152** (CC cliente, CC intermediario, caja), con su fecha original y auditoría `correccion_incidente`. Verificación: saldo inicial efectivo ARS 20/11 = 6.858.170; As Sports, Rou y Martucci vuelven a su saldo previo. Los fantasmas (A2) **no** se revierten.

### B. Que no vuelva a pasar
1. **RPC:** rechazar anular filas de una transacción **ejecutada** de una orden **no anulada** salvo que el mismo payload traiga el reemplazo; rechazar payload vacío para orden ejecutada con transacciones ejecutadas.
2. **Front:** abortar el sync de una orden ante cualquier error de lectura (prefetch, transacciones, modos de pago, estados); paginar con `.order('id')`.
3. **Cierre de día en servidor:** trigger en `movimientos_caja` que impida alterar filas con `fecha` anterior a un día cerrado salvo vía corrección explícita y auditada.
4. Eliminar DELETE físicos de caja (pasar a anular).

### C. Nueva auditoría de caja (y CC)
1. **Historial a nivel base:** tabla inmutable `movimientos_caja_historial` (y equivalentes CC) llenada por **trigger** en INSERT/UPDATE/DELETE: valores antes/después, usuario, hora, **fecha contable afectada**, **origen** (`pandi.origen` seteado por RPC/front: `login_sync`, `refrescar`, `ejecutar_transaccion`, `caja_manual`, `anular_orden`, `cola_offline`, `correccion`…). No depende del front, no se puede saltear, no traga errores.
2. **Marca "afecta día cerrado"** y delta sobre el saldo inicial de cada caja/moneda.
3. **Cierre diario persistido** (`caja_cierre_diario`: caja, moneda, día, saldo) + alerta si el recálculo difiere, con la lista de movimientos causantes.
4. **Pantalla "Historial de caja"** en lenguaje de negocio, ej.: *«19/11 17:34 · Sincronización automática (sesión de X) · Anuló Egreso efectivo ARS 2.770.000 del 30/04 · Orden 152 · Saldo inicial +2.770.000»*; filtros por caja, moneda, fecha contable, usuario, orden, origen; export Excel con columnas numéricas.
5. `auditoria_app` sin DELETE/UPDATE (ni para service_role vía política + trigger) e índices por fecha/categoría.
