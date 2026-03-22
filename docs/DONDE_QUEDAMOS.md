# Dónde quedamos (última sesión)

Cuando Cursor muestra "re open" y perdés el hilo del chat, abrí este archivo para ver en qué estábamos.

---

**Última actualización:** 2026-03-18 (E2E CC combinaciones verde + doc de respaldo)

**Hecho recientemente (E2E + RPC + docs):**

1. **RPC `sync_cc_caja_orden`:** casts con `->>` para `transaccion_numero` / `orden_numero` en caja (filas con null en JSON no rompen el INSERT). Script: `sql/rpc_sync_cc_caja_orden.sql` — volver a ejecutar en Supabase si aún no está.
2. **Tests E2E:** `01-cc-combinaciones.spec.js` con timeout global 15 min y espera de “Actualizando estado…” 90 s por cambio a ejecutada.
3. **Documentación:** `docs/TESTING_E2E_GUIA.md` (§1.6–1.7), `docs/CONTEXTO_TEST_CC_COMBINACIONES.md`, `docs/INVESTIGACION_CC_COMBINACIONES_FUENTE_VERDAD.md` §7, `docs/FUNCIONES_CRITICAS_SUPABASE_VS_FRONT.md`.
4. **main.js:** sin `console.log` de depuración en el sync CC.

---

**Sesión anterior (2026-03-17 — reglas CC y saldo intermediario):**

1. **Tabla de reglas (`sql/cc_modelo_reglas_todas_combinaciones.sql`)**
   - Matriz completa: 4 filas por tipo (estado × contrapartida_ejecutada). Comentario al inicio del archivo resume cada tipo.
   - **Cliente:** Tx1 -200k (suma/incluir según fila), Tx2 +195k, Comisión +5k. Sync escribe cuando INCLUIR Y **o** SUMA_SALDO Y.
   - **Intermediario:** Detalle = **solo 2 líneas**: Tx3 -200.000 y Tx4 +197.000. Comisión no es línea (el -3k es el saldo = -200k+197k).
   - Tx3 y Tx4: las **4 filas** cada una con INCLUIR Y (y SUMA_SALDO Y) para que en cualquier combinación E/P se escriban -200k y +197k.
   - Comisión intermediario: las 4 filas con INCLUIR N (no va al detalle).

2. **Sync en `main.js`**
   - Cliente: `escribirCcCliente = (incluir OR suma_saldo) && signo !== 0`.
   - Intermediario: `escribirCcInt = incluir_en_mov_cc_intermediario && signo !== 0` (solo INCLUIR, no suma_saldo extra).

3. **Saldo intermediario (`contribucionSaldoIntermediarioModeloCc`)**
   - **Ambas ejecutadas (Tx3 E, Tx4 E):** saldo = -200k + 197k = **-3.000**.
   - **Ambas pendientes (Tx3 P, Tx4 P) – escenario Excel:** saldo = -200k + 197k = **-3.000** (caso agregado para que el resumen no quede vacío).
   - Tx3 P + Tx4 E: -monto Tx3 pendiente + 197k = -3k.
   - Tx3 E + Tx4 P: -monto Tx4 pendiente (ej. -197k).

**Qué tenés que hacer vos:**
1. Ejecutar en Supabase (SQL Editor) el script **`sql/cc_modelo_reglas_todas_combinaciones.sql`** (UPSERT en `cc_modelo_reglas`).
2. En la app: volver a sincronizar la orden (abrir la orden y guardar/cerrar, o el flujo que dispare sync de CC).
3. Refrescar Cuenta corriente y revisar: detalle intermediario = 2 líneas (-200.000 y +197.000), saldo = -3.000.

**Archivos clave:**
- Reglas: `sql/cc_modelo_reglas_todas_combinaciones.sql` (matriz en comentarios líneas 1–13)
- Motor CC: `main.js` → `sincronizarCcYCajaDesdeOrden`, `lookupRegla`, `contribucionSaldoClienteModeloCc`, `contribucionSaldoIntermediarioModeloCc`
- Doc: `docs/CC_MODELO_MATRIZ_COMPLETA.md`

---

*(Este archivo lo puede ir actualizando el asistente al avanzar o al terminar tareas, para que después de un "re open" sepas en qué quedó todo.)*
