# PWA y operación offline — referencia técnica (Pandi)

**Versión:** 1.1 (abril 2026)  
**Audiencia:** desarrollo y operaciones. Para el usuario final ver **`docs/MANUAL_USUARIO_OFFLINE.md`**. Visión histórica y por fases: **`docs/PLAN_PWA_OPERACION_OFFLINE.md`** (v2).

---

## 1. Resumen

La app combina:

- **PWA:** `vite-plugin-pwa` (precache del shell, SW, manifest). Aviso de **nueva versión** vía listeners del registro del SW y `showToast` (sin `alert`).
- **IndexedDB** (`pandi_offline`, ver `pandi-offline-idb.js`): cola de órdenes offline y store `read_snapshots` para copias de lectura y colas de escritura pendientes.
- **localStorage:** caché de catálogos (`pandi_offline_catalogos_cache_v1`) y clave legada de cola (`pandi_offline_ordenes_queue_v1`) con migración a IDB al abrir.

Las **reglas contables** siguen en Supabase (RPC, RLS). El cliente no recalcula saldos definitivos offline más allá de mostrar última copia conocida y encolar intenciones de cambio.

---

## 2. Base IndexedDB

| Pieza | Detalle |
|-------|---------|
| Nombre | `pandi_offline` |
| Versión esquema | `2` (`pandi-offline-idb.js`) |
| Store `ordenes_queue` | Outbox de órdenes/borradores (`keyPath: localId`) |
| Store `read_snapshots` | Snapshots de lectura y registros `pending_*` (`keyPath: key`) |

Si IndexedDB falla, la cola de órdenes puede operar en **localStorage** (misma clave legada) con toast de advertencia.

---

## 3. Claves en `read_snapshots`

Todas llevan `savedAt` (ISO) para TTL y franjas de “datos al …”.

| Clave / prefijo | Uso |
|-----------------|-----|
| `read_ordenes_v1` | Listado de órdenes tras carga OK |
| `read_orden_instrumentacion_v1:<ordenId>` | Snapshot del panel Transacciones (instrumentación + trx + modos + mapas participantes) |
| `read_orden_instr_pending_v1:<ordenId>` | Parches locales (monto, modo_pago, estado/fecha) hasta flush |
| `read_inicio_cajas_v1` | Movimientos caja cerrados + flags para tarjetas del Panel |
| `read_inicio_gp_v1` | G/P operativa por período (`byPeriod`: día / semana / mes / total) |
| `read_inicio_pendientes_v1` | Conteos pendientes del Panel |
| `read_cajas_vista_v1` | Vista pantalla Cajas |
| `read_cc_vista_v1` | Vista Cuenta corriente (resumen, filtros, solapa, rango) |
| `pending_cc_manual_v1:<localId>` | Movimiento CC manual pendiente de envío |
| `pending_caja_mov_v1:<localId>` | Movimiento caja manual pendiente de envío |

**TTL habitual:** 7 días para validez de restauración (`PANDI_SNAPSHOT_*_MAX_AGE_MS`). **“Stale” UI** (franja más insistente): &gt; 24 h (`PANDI_SNAPSHOT_*_STALE_MS` donde aplica).

---

## 4. Cola de órdenes (outbox)

- **Constantes:** `PANDI_OFFLINE_QUEUE_KEY`, API `pandiOfflineQueueInit`, `pandiOfflineQueueRead/Write`.
- **Contenido:** ítems con `localId`, payload de orden, plantilla v2 (`transaccionesPlantilla`, comisiones, etc.), `syncState` (`pending` / `error`), `attempts`.
- **UI:** filas sintéticas en Órdenes, modal orden offline, import secuencial con rollback parcial documentado en bitácora.
- **Catálogos:** `pandi_offline_catalogos_cache_v1` — clientes, intermediarios, tipos_operacion (con iconos), modos_pago; refresco al tener red (`pandiRefreshOfflineCatalogosCache`).

---

## 5. Sincronización al reconectar

`runSupabaseHealthCheck` (intervalo ~60 s y tras eventos de red) cuando el servidor responde:

1. `pandiFlushPendingInstrumentacionOfflinePatches()`
2. `pandiFlushPendingCcManualOffline()`
3. `pandiFlushPendingCajaMovOffline()`

Orden relevante: instrumentación primero (puede incluir reglas de caja en servidor al marcar ejecutada), luego colas manuales CC/caja.

---

## 6. Condiciones de “sin servidor” y listado de órdenes en caché

- **`pandiSinConexionServidorViva()`** — `navigator.onLine === false`, `pandiEventoOfflineActivo`, o `pandiSupabaseConnectivityIssue === 'unreachable'`.  
- **`pandiAvisoSiSinServidorParaEscritura(etiqueta, opts)`** — si lo anterior, toast y abort; además, si `opts.requiereListadoOrdenesVivo` y `pandiOrdenesVistaDesdeCache`, toast pidiendo recargar Órdenes con red.  
- **`pandiCcManualGuardadoEnServidorOk()`** / **`pandiCajaMovimientoGuardadoEnServidorOk()`** — para decidir insert directo vs `pending_*` (requieren `onLine`, no evento offline, `pandiSupabaseConnectivityIssue === 'none'`).

### 6.1 Escrituras que usan `pandiAvisoSiSinServidorParaEscritura` (grep `main.js`)

Empresa; anular orden; anular CC manual; guardar edición CC manual existente; listados inicio “órdenes pendientes en vivo” / “transacciones pendientes en vivo”; guardar movimientos CC de orden (no manual); toggles y guardados ABM tipos movimiento caja; guardar mov. caja vinculado a orden o edición de mov. caja ya persistido; editar/guardar orden existente en servidor; chat interpretar / confirmar orden; dar de baja transacción; refresh listados + guardar clientes / intermediarios / tipos operación / orden visual / reglas.

### 6.2 Bloqueos directos con `pandiSinConexionServidorViva()` (sin pasar por el aviso genérico)

`refreshPermisosYVista`; `loadSeguridad` (mensaje en tabla); `loadTiposMovimientoCajaTable` / `loadReglasNegocioVista` (mensaje en tabla); `openModalTransaccion` (crear/editar modal completo); `cambiarEstadoTransaccion` (salvo `omitirConfirmacionReversion` en flush); `saveTransaccion`; `guardarSoloMontoTransaccion` / `guardarSoloModoPagoTransaccion` desde atajos (la tabla del panel con parches es la vía offline); rama de insert caja en `guardarCajaInsOUpd` cuando no encola.

### 6.3 Flujos con cola / parches (no bloqueados por §6.1–6.2)

Outbox órdenes (`pandiOfflineQueueWrite`); `pandiWizardGuardarEnColaLocalConPlantillaInstrumentacion`; edición modal cola v2; `pending_cc_manual_v1` en `saveCcMovimientoManual`; `pending_caja_mov_v1` en flujo nuevo movimiento caja manual; parches `read_orden_instr_pending_v1` desde panel Transacciones + flush.

---

## 7. Modo reducido vs PWA standalone

- **Modo reducido** (~10 min sin Supabase, navegador normal): `pandiModoReducidoOffline` — menú acotado a Órdenes + cola local; mensaje explícito al usuario.
- **PWA instalada** (`pandiEsPwaStandalone()` — `display-mode` standalone/fullscreen/minimal-ui o heurística iOS): **no** se fuerza modo reducido por tiempo; el usuario mantiene navegación completa con la misma lógica de caché/colas.

---

## 8. UI de estado (franjas)

`updatePandiDatosNoVivosStrip` y afines: mensajes **“Órdenes en caché”**, **“Panel en caché”** (con desglose por bloque y fecha en Argentina), **“Cajas en caché”**, **“Cuenta corriente en caché”** cuando la vista activa se alimenta solo de snapshot.

**Refresco silencioso** (~30 s): si el fetch falla, no se vacían listados ni saldos del Panel (evita parpadeo a cero).

---

## 9. Archivos principales

| Archivo | Rol |
|---------|-----|
| `main.js` | Lógica offline, snapshots, flush, health, UI |
| `pandi-offline-idb.js` | Apertura DB, cola, snapshots, prefijos |
| `vite.config.js` | Plugin PWA / Workbox |
| `index.html` | Meta manifest, Apple, estilos franjas/modales offline |

---

## 10. Pruebas y auditoría

- **E2E:** flujos con red en `tests/e2e/`; no hay suite dedicada offline.
- **Lighthouse:** `docs/LIGHTHOUSE_PWA.md`, `npm run lighthouse` / `lighthouse:mobile`.

---

## 11. Wizard → cola v2 (plantilla)

`pandiWizardGuardarEnColaLocalConPlantillaInstrumentacion`: si hay `intermediario_id` y tipo CHEQUE-ARS → `buildPlantillaRowsTransaccionesChequeConIntermediario` (`colaV2Plantilla: 'cheque4'`); si hay intermediario y no cheque → `buildPlantillaRowsTransaccionesConIntermediario` + `getOrdenPatronInstrumentacionInt()` (`'int2'`); sin intermediario → `buildPlantillaRowsTransaccionesSinIntermediario` (`'sin_int'`). Si `plant.length === 0`, toast para cola simple o conectar.

---

## 12. Manual de usuario

El contenido orientado a operadores está en **`docs/MANUAL_USUARIO_OFFLINE.md`** y se vuelca al PDF vía `scripts/export_manual_usuario_pdf.py`.

---

*Mantener alineado con cambios en `main.js` (buscar `PANDI_SNAPSHOT_`, `pandiOffline`, `pandiFlush`, `pandiAvisoSiSinServidorParaEscritura`).*
