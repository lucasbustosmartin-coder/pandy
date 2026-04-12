# Plan PWA y operación offline — Pandi

**Versión del documento:** 2.0 (abril 2026)  
**Propósito:** Este archivo conserva la **visión original**, el **histórico por fases** y el **estado real del producto**. El plan por “finde largo” fue **ampliamente superado** en `main`: hoy hay PWA, snapshots, colas en IndexedDB, parches de instrumentación, colas CC/caja manual y documentación dedicada.

**Documentación derivada (mantener al día al cambiar código):**

| Documento | Contenido |
|-----------|-----------|
| **`docs/PWA_OFFLINE_TECNICO.md`** | Claves IDB, TTL, flush, modo reducido vs PWA, archivos tocados |
| **`docs/MANUAL_USUARIO_OFFLINE.md`** | Guía operador: qué se puede hacer sin red (lectura por snapshot, colas, instrumentación en tabla, CC/caja manual encolados, límites y acciones que exigen servidor); vuelca a `manual_usuario.pdf` |
| **`docs/LIGHTHOUSE_PWA.md`** | Auditoría Lighthouse 12 + checklist manual PWA |

**Salida Word (.docx):** `docs/PLAN_PWA_OPERACION_OFFLINE.docx` — `npm run plan-pwa:docx` tras editar este `.md`.

---

## 1. Situación actual en producción (no solo “modo reducido”)

Además del **modo reducido** (~10 min sin Supabase en navegador tab) y la **cola en localStorage/IndexedDB**, la app incluye:

- **PWA:** instalable, service worker, precache, aviso de nueva versión (`showToast` + recargar).
- **Outbox de órdenes** en IndexedDB (`ordenes_queue`) con migración desde cola legada; fallback localStorage si IDB falla.
- **Caché de catálogos** (clientes, intermediarios, tipos, modos de pago) en `localStorage` con refresco al online.
- **Cola v2 / borradores:** wizard sin red → plantilla de transacciones y comisiones; edición en modal antes de importar; import con manejo de errores y quitar ítem de cola.
- **Snapshots de lectura** (TTL 7 días, franja “stale” &gt; 24 h donde aplica): listado órdenes, panel inicio (caja, G/P, pendientes), vistas Cajas y CC, instrumentación por `ordenId`.
- **Parches offline** de instrumentación (`read_orden_instr_pending_v1:`) con flush en health check al volver red.
- **Colas** `pending_cc_manual_v1:` y `pending_caja_mov_v1:` con filas “Sin sincronizar” y validación en servidor al enviar.
- **PWA standalone:** no se fuerza modo reducido por tiempo; misma navegación con caché y mensajes.
- **Escrituras sin cola:** bloqueo centralizado con mensajes claros y Reintentar (`pandiAvisoSiSinServidorParaEscritura`).

**No implementado** como “paridad total offline” (nivel D del plan original): sync bidireccional completa de todo el maestro, resolución formal de conflictos multi-dispositivo, suite E2E offline, cifrado de colas.

---

## 2. Qué significa “operar offline útil” (definición)

| Nivel | Descripción | Complejidad |
|-------|-------------|-------------|
| A — Shell offline | App instalable, carga UI sin red | **Hecho** |
| B — Lectura offline | Snapshots con fecha y franjas | **Hecho** (acotado a pantallas soportadas) |
| C — Escritura en cola | Órdenes, parches inst., CC/caja manual pendientes | **Hecho** (lista cerrada de flujos) |
| D — Paridad casi total | Misma superficie + conflictos | **No** |

---

## 3. Arquitectura objetivo (visión)

Sin cambios conceptuales: manifest, SW, IndexedDB, outbox, política de lectura TTL, reglas en servidor. Ver **`docs/PWA_OFFLINE_TECNICO.md`** para el mapa real de claves y funciones.

---

## 4. Alcance por área (estado)

### 4.1 Órdenes e instrumentación

Implementado según bitácora y `PWA_OFFLINE_TECNICO.md`: cola v2, vista tabla en panel Transacciones online, snapshot + prefetch, parches offline, import y rollback documentados.

### 4.2 Cuenta corriente y caja

Lectura desde snapshot con etiquetas de caché; movimientos manuales encolables; validación de egreso al aplicar en servidor.

### 4.3 Catálogos

Caché local con refresco al reconectar; uso en wizard offline y modales de cola.

---

## 5. Conflictos y reglas de negocio

Sigue siendo relevante para roadmap: último gana, versionado optimista, etc. Hoy el alcance evita editar la misma entidad en dos dispositivos sin coordinación; la documentación de usuario advierte sobre datos “congelados”.

---

## 6. Plan por fases — estado de implementación

| Fase | Objetivo original | Estado |
|------|-------------------|--------|
| 0 | Preparación | Cerrada (evolución continúa en bitácora) |
| 1 | PWA instalable + SW + actualización | **Hecho** |
| 2 | Persistencia y cola (IndexedDB) | **Hecho** para órdenes + extensiones manuales |
| 3 | Lectura offline acotada + indicadores | **Hecho** (órdenes, inicio, cajas, CC, instrumentación) |
| 4 | Pruebas manuales, Lighthouse, doc | **Parcial:** sin E2E offline; Lighthouse vía `docs/LIGHTHOUSE_PWA.md`; matriz móvil/PWA en curso (`docs/FASE_A_PRUEBAS_MOVIL_PWA.md`, fases A→B filtros Órdenes, etc.) |

Detalle técnico de claves y TTL: **`docs/PWA_OFFLINE_TECNICO.md`**.

---

## 7. Riesgos

- Caché de HTML/bundles → mitigado con flujo de actualización del SW.
- Datos obsoletos → mitigado con franjas y fechas en Argentina.
- Duplicados en reintento de cola → mitigado con import controlado y quitar ítem.
- Sesión expirada tras offline largo → UX: re-login; ver manual de usuario.

---

## 8. Checklist técnico resumido

- [x] Manifest válido (revisar en DevTools → Application).
- [x] HTTPS en producción (Vercel).
- [x] Service worker + estrategia de update (plugin PWA + toast).
- [x] IndexedDB / outbox / snapshots (probar con Network Offline en DevTools).
- [x] UX: toasts y confirmaciones internas (sin `alert`/`confirm` del navegador para flujos de negocio).
- [x] Documentación: plan v2, técnico, manual usuario, Lighthouse.
- [ ] Suite automatizada offline (no en alcance actual).

---

## 9. Histórico — alcance “Fase 1 fin de semana largo” (referencia)

La sección siguiente conserva el **texto orientativo** del plan original (fines de 2025 / 2026) para contexto. **Ya no describe el límite del producto:** el código actual va más allá (snapshots, colas manuales, parches, etc.).

**Objetivo original de la fase:** PWA instalable, UI sin red, actualización segura, documentar Fase 2.

**No entraba en Fase 1 original:** cola genérica IndexedDB para toda la app, snapshots CC/caja, encolar todas las mutaciones — parte de esto **sí se implementó después**.

### 9.1 Criterios de “listo” (histórico)

1. Instalar en Android/Edge y abrir en ventana propia.
2. Tras visita con red, con avión la UI carga (login/shell).
3. Nueva versión en Vercel → usuario puede enterarse y recargar (toast).
4. iOS: Añadir a inicio razonable.
5. Manifest / SW sin errores críticos.
6. Bitácora + versión actualizadas al cierre del entregable.

### 9.2 Desglose sugerido por día (histórico)

| Día | Entregable |
|-----|------------|
| 1 | Manifest, iconos, meta Apple |
| 2 | vite-plugin-pwa, precache |
| 3 | Toast nueva versión |
| 4 | Pruebas móvil, Lighthouse, despliegue |

### 9.3 Archivos típicos

`index.html`, `vite.config.js`, `public/`, `main.js`, `package.json`.

---

## 10. Referencias en código

Buscar en `main.js`: `pandi-offline`, `PANDI_SNAPSHOT_`, `pandiFlush`, `pandiOfflineQueue`, `pandiEsPwaStandalone`, `pandiModoReducidoOffline`, `updatePandiDatosNoVivosStrip`.  
Módulo IDB: `pandi-offline-idb.js`.

---

*Documento de planificación y estado; ajustar cuando cambie el alcance de offline/PWA.*
