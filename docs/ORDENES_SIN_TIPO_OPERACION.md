# Órdenes sin tipo de operación y sin transacción que las anule

Documento de análisis: ante qué eventos puede quedar una orden en base de datos **sin tipo de operación** (y en la práctica sin cliente/intermediario) y **sin transacción que las anule** (estado `anulada` por update directo, no por flujo de transacciones).

---

## 1. Borrador de “Nueva orden” que no se elimina

**Flujo:** Usuario hace clic en **“+ Nueva orden”**.

- En `openModalOrden(null)` se llama a `crearOrdenBorrador()`.
- `crearOrdenBorrador()` hace un **INSERT** en `ordenes` con solo: `fecha`, `estado: 'pendiente_instrumentar'`, `moneda_recibida`, `moneda_entregada`, `monto_recibido`, `monto_entregado`, `usuario_id`, `updated_at`.  
  **No se envía** `tipo_operacion_id`, `cliente_id` ni `intermediario_id` → quedan en `NULL`.

Si el usuario **cierra el modal sin guardar**, en `closeModalOrden()` se hace:

- `client.from('ordenes').delete().eq('id', idBorrador)`.

**Eventos en los que la orden borrador puede quedar en BD (sin tipo y luego anulada “a mano”):**

1. **El delete falla** (red, RLS, etc.): el borrador sigue en BD con `tipo_operacion_id` (y cliente/intermediario) en `NULL`.
2. **No se llega a ejecutar `closeModalOrden()`**: por ejemplo el usuario cierra la pestaña, cierra el navegador o navega a otra vista sin cerrar el modal. Al recargar, `ordenIdBorradorParaEliminar` se pierde y ya no se intenta borrar ese registro.
3. **Cierre con lógica diferida**: si hay instrumentación abierta, el cierre espera a guardar montos y usa un timeout; si algo falla, igual se llama `doClose()` y se intenta el delete. Si ese delete falla, el borrador persiste.

Esas órdenes quedan en `pendiente_instrumentar` con tipo/cliente/intermediario en `NULL`. Si alguien las “limpia” cambiando el estado a **Anulada** desde la UI (botón Anular o editar estado), pasan a estar **anuladas sin ninguna transacción que las anule** (solo un `UPDATE ordenes SET estado = 'anulada'`).

---

## 2. Guardar / actualizar con tipo vacío

En **Guardar** (desde el wizard o desde el modal de edición) el payload lleva:

- `tipo_operacion_id: tipoOperacionId || null`

Si en el formulario el usuario tiene **“Tipo de operación”** en blanco (por ejemplo vuelve a Participantes, elige “Elegir…” y guarda, o edita una orden existente y borra el tipo), se hace **UPDATE** (o en otro flujo INSERT) con `tipo_operacion_id = null`.  
Eso puede generar (o dejar) una orden **sin tipo de operación**. Si después se anula por el botón Anular, queda **anulada sin transacción que las anule**.

---

## 3. Órdenes creadas desde “Cargar por chat”

En `setupModalChatOrden()`, al confirmar la creación desde el chat se hace un **INSERT** en `ordenes` con:

- `tipo_operacion_id: r.tipo_operacion_id`

`r` viene de la interpretación del mensaje. Si esa interpretación no incluye tipo (o no se valida), `r.tipo_operacion_id` puede ser `null` y se crea una orden **sin tipo de operación**.  
Solo se valida TC para ARS-USD/USD-ARS; no hay validación obligatoria de `tipo_operacion_id` antes del insert. Si luego se anula por la UI, queda **anulada sin transacción que las anule**.

---

## 4. Cómo quedan “sin transacción que las anule”

En este código la **anulación** de una orden se hace por **actualización directa** del estado:

- Botón **Anular** en la tabla o en el modal:  
  `client.from('ordenes').update({ estado: 'anulada', ... }).eq('id', id)`  
  (ver uso de `showConfirm` y el `update` en `main.js`).

No existe un flujo donde “una transacción” (fila en `transacciones`) sea la que anule la orden. Por tanto, **todas** las órdenes con estado `anulada` están en la situación de “sin transacción que las anule” en ese sentido.  
Lo que el usuario señala es la combinación: orden **sin tipo de operación** (y sin cliente/intermediario) que además está **anulada** por ese update directo.

---

## Resumen de eventos que llevan a orden sin tipo y anulada “sin transacción”

| Origen | Cómo se genera la orden sin tipo | Cómo pasa a “anulada sin transacción” |
|--------|-----------------------------------|----------------------------------------|
| Borrador no eliminado | INSERT en `crearOrdenBorrador()` sin tipo/cliente/intermediario; el delete en `closeModalOrden()` no se ejecuta o falla. | Usuario (o proceso) cambia estado a Anulada desde la UI. |
| Guardar con tipo vacío | UPDATE/INSERT con `tipo_operacion_id = null` desde el formulario de orden. | Idem: Anular desde la UI. |
| Chat | INSERT desde modal chat con `r.tipo_operacion_id` null. | Idem: Anular desde la UI. |

Tras un **truncate** (p. ej. `sql/truncar_ordenes_transacciones.sql`), estas situaciones solo volverán a aparecer si se repiten los flujos anteriores (borrador no borrado, guardar con tipo vacío o chat sin tipo).

---

## Medidas opcionales para reducir recurrencia

- **Borrador:** Reintentar el delete si falla; o marcar borradores (ej. `es_borrador = true`) y limpiarlos con un job o al abrir de nuevo “Nueva orden”.
- **Guardar:** Validar en front (y/o en backend/DB) que `tipo_operacion_id` no sea null al guardar una orden que no sea borrador.
- **Chat:** Validar `r.tipo_operacion_id` antes del insert y no crear la orden si falta.
- **Base de datos:** Si el modelo lo permite, restricción CHECK o NOT NULL condicional para que las órdenes no borrador tengan `tipo_operacion_id` (y/o cliente) informado.
