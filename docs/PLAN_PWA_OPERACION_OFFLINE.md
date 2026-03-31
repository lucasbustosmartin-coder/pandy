# Plan PWA y operación offline — Pandi

**Versión del documento:** 1.1 (marzo 2026)  
**Propósito:** Guía para evaluar e implementar una PWA con **operación offline útil**, distinta del **modo reducido actual** (cola local de órdenes en `localStorage`, catálogo cacheado, flujo acotado).

---

## 1. Situación actual (referencia)

Hoy existe un **modo reducido offline** orientado a contingencia:

- Cola de órdenes en clave `pandi_offline_ordenes_queue_v1` y caché de catálogos `pandi_offline_catalogos_cache_v1` (vía `localStorage`).
- UI dedicada (franja, modal “orden offline”, importación a Supabase cuando vuelve la red).
- **No** es equivalente a “usar la app completa sin red”: no hay sync bidireccional de CC/caja, ni lectura offline de datos maestros voluminosos, ni cola genérica de todas las mutaciones.

**Objetivo del nuevo plan:** acercarse a un **trabajo operativo offline** (consultar lo necesario, registrar operaciones, y **sincronizar** al reconectar con reglas claras de conflicto).

---

## 2. Qué significa “operar offline útil” (definición)

Conviene fijar expectativas con negocio:

| Nivel | Descripción | Complejidad |
|-------|-------------|-------------|
| A — Shell offline | App instalable, carga UI sin red, mensaje “sin conexión” | Baja (días) |
| B — Lectura offline | Ver listados ya visitados o snapshot (órdenes, clientes clave, saldos “congelados”) | Media |
| C — Escritura en cola | Crear/editar entidades con cola persistente (IndexedDB), replay al online | Alta |
| D — Paridad casi total | Misma superficie que online con resolución de conflictos | Muy alta |

**Recomendación para un finde largo inicial:** fijar **B + parte de C** en flujos críticos (p. ej. nueva orden / borrador / cola), en lugar de prometer paridad total.

---

## 3. Arquitectura objetivo (visión)

### 3.1 Capas

1. **Web App Manifest** — Instalación, iconos, `display: standalone`, tema.
2. **Service Worker** — Caché de shell (HTML, JS, CSS, assets estáticos); estrategia de actualización al desplegar nueva versión (evitar usuarios “atascados” en build viejo).
3. **Almacenamiento local estructurado** — Preferir **IndexedDB** sobre `localStorage` para volúmenes mayores, índices y transacciones.
4. **Cola de sincronización (outbox)** — Operaciones pendientes: `{ id, tipo, payload, creado_en, intentos, estado }` con reintentos y orden.
5. **Capa de red** — Interceptor o wrapper de llamadas Supabase: si offline → encolar; si online → ejecutar y marcar hecho.
6. **Política de lectura** — Qué datos se precargan o cachean (TTL, límites) para no inflar el dispositivo ni exponer datos sensibles sin criterio.

### 3.2 Supabase / Postgres

- Las reglas de negocio siguen en **servidor** (RPC, RLS). Offline no “inventa” saldos: al reconectar se aplican las mismas RPC o se rechaza con mensaje claro.
- Valorar **idempotencia** en operaciones críticas (IDs de cliente, claves de deduplicación) para que un reintento no duplique órdenes/transacciones.
- **Auth:** refresh token en disco; al estar offline largo, puede expirar sesión → definir UX (solo lectura cacheada, o bloqueo hasta login).

---

## 4. Alcance sugerido por área de la app

### 4.1 Órdenes e instrumentación

- **Prioridad alta:** seguir pudiendo **cargar borradores / cola** y sincronizar órdenes al volver red (evolución del modo actual hacia IndexedDB + estados de sync).
- Definir si las transacciones/instrumentación se pueden **editar offline** o solo **crear pendiente de validación**.

### 4.2 Cuenta corriente y caja

- **Lectura:** mostrar último snapshot conocido con etiqueta **“Datos al … (offline)”** para no confundir con tiempo real.
- **Escritura:** normalmente **encolar** movimientos manuales o cambios de estado; al sync, recalcular con motor del servidor.

### 4.3 Catálogos (clientes, intermediarios, tipos)

- Caché con versión o fecha; refresco al online.
- Límite de filas o “solo favoritos” si el volumen es grande.

---

## 5. Conflictos y reglas de negocio

- Si dos dispositivos editan la misma orden: estrategias típicas — **último gana** (con advertencia), **bloqueo optimista** (falla si versión cambió), o **fusión manual** (costosa).
- Documentar qué hace Pandi hoy en servidor (timestamps, `updated_at`) para alinear la cola offline.

---

## 6. Plan por fases (operativo)

### Fase 0 — Preparación (0,5–1 día)

- Acordar **nivel objetivo** (tabla sección 2).
- Inventario de llamadas a Supabase en `main.js` (lecturas vs mutaciones).
- Criterios de seguridad: qué puede quedar en disco (cifrado opcional para colas sensibles en roadmap).

### Fase 1 — PWA instalable (1–1,5 días)

- Manifest + iconos 192/512 + maskable.
- Meta tags iOS (apple-touch-icon, `apple-mobile-web-app-capable`).
- Integración **Vite** (p. ej. plugin PWA) con precache del shell.
- Política **“nueva versión disponible”** (toast interno, no `alert`).

### Fase 2 — Persistencia y cola (1,5–2,5 días)

- Migrar o complementar cola actual hacia **IndexedDB** (outbox).
- Wrapper de fetch/Supabase: modo offline → encolar operaciones definidas (lista cerrada al inicio).
- Estados UI: “Pendiente de envío”, “Error”, “Sincronizado”.

### Fase 3 — Lectura offline acotada (1–2 días)

- Cache de listados recientes o pantalla actual con TTL.
- Indicadores globales de “modo offline” / “datos no actualizados”.

### Fase 4 — Pruebas y despliegue (1 día)

- Pruebas en Chrome Android, Safari iOS (instalación, actualización SW).
- Smoke E2E donde aplique.
- Documentación en `docs/` y despliegue según flujo del repo.

**Nota:** Un **finde largo de 4 días** alcanza bien **Fase 1 + inicio fuerte de Fase 2** si el alcance se mantiene disciplinado. Un **offline “útil” completo (B+C amplio)** suele requerir **varios ciclos** o más días.

---

## 7. Riesgos

- **Caché agresiva** de `index.html` o bundles → usuarios en versión vieja; mitigar con flujo de actualización.
- **Datos obsoletos** mostrados como actuales → siempre rotular origen y fecha del snapshot.
- **Duplicados** al reenviar cola → idempotencia y pruebas de reintento.
- **RLS y sesión** → operaciones encoladas deben enviarse con usuario válido tras offline prolongado.

---

## 8. Checklist técnico resumido

- [ ] Manifest válido (Lighthouse / DevTools Application).
- [ ] HTTPS (Vercel ya cumple).
- [ ] Service Worker registrado; estrategia de update documentada.
- [ ] IndexedDB / outbox con prueba de pérdida de red simulada.
- [ ] UX: toasts y mensajes según estándar del proyecto (sin diálogos del navegador).
- [ ] Bitácora / versión de app actualizadas al cerrar entregable (según reglas del repo).

---

## 9. Fase 1 (fin de semana largo) — alcance cerrado para implementar

**Objetivo de la fase:** que Pandi sea una **PWA instalable**, que **abra la interfaz sin red** (shell en caché), que **no queden usuarios atrapados** en una versión vieja tras un despliegue, y que quede **documentado** qué sigue en Fase 2.  
**No entra en Fase 1:** cola genérica en IndexedDB para toda la app, snapshots offline de CC/caja, sync multi-dispositivo ni resolución de conflictos (eso es Fase 2+).

### 9.1 Criterios de “listo” (definición de hecho)

1. Desde Chrome (Android) o Edge: **Instalar** / **Agregar a la pantalla de inicio** y la app abre en **ventana propia** (standalone), con icono y nombre coherentes.
2. Con el avión activado **después** de una visita previa con red: la **UI carga** (al menos pantalla de login o shell); no pantalla en blanco por falta de JS.
3. Tras publicar una **nueva versión** en Vercel: en la próxima visita el usuario puede **enterarse y recargar** (toast interno + acción; sin `alert()`).
4. **iOS Safari:** icono en “Compartir → Añadir a inicio”; se abre razonablemente (aceptar limitaciones conocidas de iOS con SW).
5. **Lighthouse** (o DevTools → Application): manifest sin errores críticos; SW registrado.
6. **Bitácora + versión** del proyecto actualizadas al cerrar el entregable (reglas del repo).

### 9.2 Fuera de alcance explícito (Fase 2)

- Migrar la cola offline actual (`localStorage`) a **IndexedDB** con reintentos robustos (opcional *stretch* si sobra tiempo).
- Caché de **listados de negocio** (órdenes, clientes) para lectura offline amplia.
- Encolar **cambios de estado**, **CC manual**, **caja** u otras mutaciones fuera del flujo ya existente de “modo reducido”.
- **Background Sync** API (opcional, más adelante).

### 9.3 Desglose sugerido por día (4 días no laborables)

| Día | Entregable |
|-----|------------|
| **1** | `manifest.webmanifest` (o equivalente en `public/`), iconos **192×192** y **512×512** (reutilizar/adaptar `assets/`), `theme-color`, enlaces en `index.html`, meta **Apple** (touch icon, `apple-mobile-web-app-capable`). Probar en DevTools → Manifest. |
| **2** | Integrar **`vite-plugin-pwa`** (o equivalente) en `vite.config.js`: precache de entrada + assets de build; revisar que `vercel build` incluya SW y manifest en `dist/`. Probar `npm run build` + `npm run preview`. |
| **3** | Flujo **“hay actualización”**: al activarse nuevo SW, `showToast` + botón **Recargar** (y/o recarga al cerrar pestaña, según decisión). Documentar en 1 párrafo en `docs/`. |
| **4** | Prueba manual **Android + iPhone** (instalación y offline básico); ajustes CSS si algo rompe en standalone; smoke **E2E** opcional si no fricciona; **versión sidebar** + bitácora + despliegue según flujo habitual. |

### 9.4 Archivos / piezas que probablemente toques

- `index.html` — links manifest, meta, icons.
- `vite.config.js` — plugin PWA, opciones Workbox (precache).
- `public/` — manifest + iconos si no se generan por script.
- `main.js` — registro del SW / listeners de actualización conectados a `showToast` (según cómo exponga el plugin).
- `package.json` — dependencia del plugin; script de build sin cambios de flujo para el equipo.

### 9.5 Riesgos a vigilar en Fase 1

- **Caché de documento principal:** si el HTML queda “pegado”, la Fase 1 **debe** incluir el aviso de actualización (día 3).
- **Rutas y `base` de Vite:** el `start_url` y `scope` del manifest deben coincidir con cómo se sirve la app en producción (`/` en `pandi.company`).
- **Dos dominios (prod / preview):** mismo comportamiento PWA en ambos es aceptable; verificar que no se mezclen cachés de forma confusa en pruebas.

### 9.6 Argumento para el equipo / negocio

“En un fin de semana largo alcanza **instalable + carga sin red + actualización segura**. El **offline operativo completo** (más pantallas, más colas, coherencia con Supabase) es **otra entrega** para no comprometer calidad ni riesgo de datos.”

---

## 10. Referencias en código actual

- Claves offline: `PANDI_OFFLINE_QUEUE_KEY`, `PANDI_OFFLINE_CACHE_KEY`, lógica modo reducido y franja UI en `main.js` (buscar `pandi-offline`, `pandiModoReducidoOffline`).

---

*Documento generado para planificación interna; ajustar fechas y alcance según prioridad de negocio.*

**Salida Word (.docx):** `docs/PLAN_PWA_OPERACION_OFFLINE.docx` — regenerar desde la raíz con `npm run plan-pwa:docx` (tras editar este `.md`).
