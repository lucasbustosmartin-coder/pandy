# Plan: intermediario como cliente — misma cuenta corriente (vista)

Objetivo: que una persona que figura como **intermediario** en algunas órdenes y como **cliente** en otras tenga **un solo saldo consolidado** en la app, sin romper el motor de reglas ni mezclar roles dentro de la misma transacción.

---

## Fase 1 (hecha en repo) — Opción 2: tabla puente

En lugar de una columna `vinculo_cliente_id` en `intermediarios`, se usa una tabla **`contraparte_vinculo`**:

| Columna | Descripción |
|--------|-------------|
| `intermediario_id` | FK a `intermediarios` — **único** (un intermediario en un solo vínculo) |
| `cliente_id` | FK a `clientes` — **único** (un cliente en un solo vínculo) |

- **ON DELETE CASCADE:** si se borra el intermediario o el cliente, se elimina la fila de vínculo.
- **RLS:** `SELECT` para todo `authenticated`; `INSERT` / `UPDATE` / `DELETE` si el rol tiene **`abm_intermediarios`** o **`abm_clientes`**.
- **Scripts:** `sql/supabase_complejidad_ordenes.sql`, `sql/supabase_rls_complejidad.sql`, migración idempotente `sql/migracion_contraparte_vinculo_intermediario_cliente.sql` (bases ya desplegadas). Incluida en `scripts/concat-bootstrap-dev-sql.js`.

Los movimientos siguen guardándose donde corresponde por rol (**CC cliente** vs **CC intermediario**); esta fase **no** cambia el front ni agrega UI.

---

## Fase 2 (hecha en app) — ABM y datos

- En **Editar intermediario** y **Editar cliente** (con permiso `abm_intermediarios` **o** `abm_clientes`): selector **«Mismo registro que cliente / intermediario»** y ayuda `?`. Al **Guardar** se actualiza `contraparte_vinculo` (quitar = opción vacía). Listados de **Clientes** e **Intermediarios** muestran columna con el nombre del vínculo.
- Carga de datos reales del vínculo: manual desde la app (sin script obligatorio).

---

## Fase 3 — Cuenta corriente (lectura) — hecha en app

- **Tipo Cliente:** solo clientes **sin** fila en `contraparte_vinculo` (como `cliente_id`). Quien está vinculado a un intermediario **no** aparece en esta vista ni en sus saldos: la posición unificada es la fila **Intermediario** (y en **Total** no se duplica). Los movimientos de su CC “rol cliente” siguen persistidos en `movimientos_cuenta_corriente`; solo cambia la lectura en pantalla.
- **Tipo Intermediario:** saldo resumen, pestaña **Movimientos**, modal **Ver detalle** (tabla + órdenes vinculadas), combo de entidad y export Excel usan la **unión** de movimientos de `movimientos_cuenta_corriente_intermediario` y, si hay vínculo, los de `movimientos_cuenta_corriente` del cliente emparejado. Implementación: `main.js` (`loadCuentaCorriente` + `buildCcResumenRows`, `obtenerFilasCcResumenFiltradas`, `pandiCcDetallePasaFiltroTipo`, `fetchMovimientosCcPorEntidad`, filtros detalle). **No** se mueven filas entre tablas en BD ni se altera el sync/RPC.

---

## Fase 4 — Órdenes (ajustada: se permite el par vinculado en la misma orden)

- **Regla de producto:** si existe vínculo en **`contraparte_vinculo`**, la **misma orden** **puede** tener ese `cliente_id` y ese `intermediario_id` a la vez cuando el circuito lo exige (misma persona en ambos roles; la vista CC tipo Intermediario ya unifica ambos libros).
- **Front — tipo *con* intermediario:** si el usuario elige un **tipo de operación que usa intermediario** y además **cliente** e **intermediario** coinciden con una fila de **`contraparte_vinculo`**, la app **avisa con toast** al cumplirse las tres condiciones y **bloquea** guardar / avanzar al paso detalles / cola local (wizard online, cola con plantilla y modal «Orden en cola local»). El mensaje indica usar el **mismo tipo sin intermediario** y armar la instrumentación como **multiparte**. No aplica cuando el intermediario elegido **no** es el del vínculo de ese cliente.
- **Supabase:** la restricción anterior (trigger `tr_ordenes_no_par_vinculado` de `sql/migracion_ordenes_validar_no_par_vinculado_fase4.sql`) se **revoca** con **`sql/migracion_ordenes_quitar_trigger_par_vinculado.sql`** en cada base donde se hubiera aplicado la Fase 4. El bootstrap dev concatena ese script después de la migración Fase 4. Detalle: `docs/SUPABASE_REQUISITOS.md`.

---

## Fase 5 — Manual CC, exports, offline, tests

- Movimientos manuales CC: criterio de escritura (¿sigue separado por tabla o selector unificado?).
- Revisar exportaciones, snapshots offline, G/P si agregan por ID suelto.
- E2E mínimos y bitácora.

---

## Referencias

- `docs/SUPABASE_REQUISITOS.md` — cómo aplicar la migración en Supabase.
- `docs/CUENTA_CORRIENTE_Y_CAJA.md` — modelo actual de CC.
- `docs/MODELO_ORDENES_INSTRUMENTACION.md` — roles cliente / intermediario en transacciones.
