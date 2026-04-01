# Trabajar sin conexión o con datos en caché (Pandi)

Guía actualizada al comportamiento real de la app: **PWA**, **IndexedDB**, **colas locales** y **snapshots** de lectura. Complementa los textos de ayuda (**?**) y los mensajes que ves en pantalla.

---

## 1. Qué cuenta como “sin servidor” para la app

La app trata como **no disponible para acciones de nube** cuando, entre otras señales:

- El navegador está **sin red** (avión, sin datos), o  
- Hubo **fallo de red** típico (p. ej. “Load failed”) y quedó marcado el evento offline, o  
- El **chequeo de salud** a Supabase indica que el servicio **no alcanzable**.

En esas condiciones verás mensajes del tipo *«… no está disponible sin conexión con el servidor»* y el aviso superior con **Reintentar**.

**Importante:** si el listado de **Órdenes** se está mostrando solo desde **caché** (última copia en el dispositivo), aunque haya red algunas acciones piden **datos en vivo** de órdenes: la app te avisará que recargues Órdenes con conexión.

---

## 2. Instalar la app (PWA) y actualizar versión

- **Android / Chrome o Edge:** menú → Instalar o “Agregar a pantalla de inicio”.  
- **iPhone / iPad (Safari):** Compartir → “Añadir a inicio”.

Conviene entrar **al menos una vez con buena conexión** para que se guarden la interfaz y los archivos. Si aparece aviso de **nueva versión**, usá **Recargar** para no quedar con código viejo.

---

## 3. Avisos y franjas (datos “congelados”)

Cuando la información **no viene en vivo** del servidor, puede mostrarse una **franja** con la **fecha de la copia** (calendario de Argentina).

Ejemplos frecuentes:

| Mensaje (resumen) | Qué significa |
|-------------------|----------------|
| **Órdenes en caché** | El listado de órdenes es una copia anterior. |
| **Panel en caché** | Parte del panel de inicio (caja, G/P, pendientes) usa copia local. |
| **Cajas en caché** | La vista Cajas usa la última copia guardada. |
| **Cuenta corriente en caché** | La vista CC usa la última copia guardada. |

Las copias suelen ser **válidas hasta varios días** si no las borrás del navegador; si son **muy viejas**, el aviso puede ser más insistente. **Los saldos y totales reflejan el momento de la copia**, no necesariamente el estado actual del servidor.

**Refresco en segundo plano:** si falla la red, la app **evita vaciar** tablas o saldos para que no “parpadeen” en cero.

---

## 4. Modo reducido vs app instalada (PWA)

| Situación | Comportamiento |
|-----------|----------------|
| **Navegador normal** y mucho tiempo **sin respuesta de Supabase** | Puede activarse **modo reducido**: solo la vista **Órdenes** y la **cola local** como vía principal. |
| **App instalada** (PWA en ventana propia / iOS “Añadir a inicio”) | **No** se fuerza ese modo por tiempo: seguís con el **menú completo** y la misma lógica de caché y colas. |

---

## 5. Lectura offline (necesitás haber cargado antes con conexión)

Sin red, podés **seguir viendo** lo que ya se guardó en el dispositivo al cargar con éxito:

- **Listado de Órdenes** (mezclado con filas de **cola local**, si hay).  
- **Panel de inicio:** tarjetas de **caja** (movimientos cerrados), **G/P operativa** (por período: día / semana / mes / total), bloque **Pendientes**.  
- **Vista Cajas:** tabla de movimientos y totales según la copia.  
- **Vista Cuenta corriente:** resumen y movimientos según la copia y filtros que ya tenías.  
- **Órdenes en el servidor — panel Transacciones** (fila expandida): si antes abriste **Transacciones** con red, suele haber **instrumentación en caché** por orden; se puede combinar con cambios locales pendientes de envío (ver §7).

**Exportar a Excel** (Caja, CC, etc.): si los datos ya están cargados en pantalla, el export usa esa información; no crea datos nuevos en el servidor.

---

## 6. Escribir: órdenes nuevas y cola local

### 6.1 Cola simple — «Orden en cola local»

Desde **Órdenes**, botón para abrir el **formulario reducido** (tipo, fechas, participantes, montos, etc.). Los datos usan el **catálogo en caché** (clientes, intermediarios, tipos, modos de pago). Podés:

- Guardar ítems en la cola de **este navegador**.  
- Ver el **resumen**, **quitar** un ítem solo de la cola (no borra Supabase).  
- **Descargar JSON** de respaldo.  
- Con conexión: **Enviar cola local** (importa en orden; si algo falla, los mensajes y la cola te orientan).

### 6.2 Cola con instrumentación (wizard sin red) — plantilla v2

En **Nueva orden**, si no hay conexión a la nube, el flujo **«Ir a instrumentación»** puede guardar en cola una **plantilla de transacciones** (y comisiones si corresponde), según el tipo:

- **Sin intermediario:** plantilla automática cuando el tipo la define (p. ej. dos transacciones en USD-USD, cruces con tipo de cambio, etc.). Si el tipo **no** tiene plantilla automática, la app te indica que uses la **cola simple** o que te conectes.  
- **Con intermediario y CHEQUE-ARS:** plantilla de **cuatro** transacciones (efectivo + cheque en caché).  
- **Con intermediario (otros tipos):** plantilla de **dos** transacciones según el patrón de instrumentación elegido en el wizard.

**Al importar con conexión** se crean orden, instrumentación, transacciones y comisiones en el servidor y corre el proceso habitual de **CC/caja**. **En el dispositivo no se valida saldo de caja** como en servidor: revisá coherencia antes de enviar.

### 6.3 Editar borrador en cola

En el listado de Órdenes, las filas **«Cola local»** permiten abrir **Editar borrador offline** (solo ítems **v2** con plantilla): ajustar **montos**, **modo de pago**, **estado** (pendiente/ejecutada) y **fecha de ejecución** por fila antes de importar.

### 6.4 Editar una orden que ya está en el servidor

**Guardar cambios** de una orden existente en la nube **requiere** conexión y listado en vivo cuando aplique. **Crear** la primera orden **solo en servidor** también requiere red; sin red usá cola (§6.1–6.2).

---

## 7. Instrumentación de órdenes ya en Supabase (sin red)

- **Formulario grande** de Nueva / Editar **transacción** (modal completo) y **guardar** desde ahí: **requieren servidor**.  
- **Atajo de monto** en el listado del wizard (lápiz rápido) sin red: la app te orienta a abrir **Transacciones** en la fila de la orden.  
- Con **instrumentación en caché** y permiso **editar transacciones**, al **desplegar Transacciones** en la orden podés usar la **tabla** para cambiar monto, modo de pago y estado; esos cambios quedan como **parches locales** y se **envían al reconectar** (con las validaciones del servidor, p. ej. caja al ejecutar).  
- **Eliminar / dar de baja** una transacción en servidor: **no** disponible sin conexión.  
- Con conexión y datos vivos, en el panel expandido puede mostrarse **Vista tabla** (misma idea que el editor de tabla de cola) para órdenes en estados de instrumentación pendiente / parcial / cerrada en ejecución.

---

## 8. Cuenta corriente — movimiento manual

- **Nuevo** movimiento manual: si en ese momento **no** se considera seguro guardar directo en servidor (sin red o conectividad degradada), el movimiento puede **guardarse en cola local** del dispositivo; en el detalle aparecen filas **«Sin sincronizar»** (con opción de quitar de la cola). Al volver la conexión estable, se **reenvían** y recién ahí aplican reglas y validaciones fuertes (incl. **caja** si el flujo lleva efectivo a caja).  
- **Editar o anular** un movimiento manual **ya guardado en servidor**: **requieren servidor**.

---

## 9. Cajas — movimiento manual

- **Alta** de movimiento **solo caja** (no CC): en condiciones offline admitidas, puede **encolarse** de forma análoga a CC manual; filas **Sin sincronizar**; **egresos** pueden validarse contra **última información conocida** de caja **más** movimientos pendientes en cola.  
- **Editar** un movimiento de caja **ya en servidor** o movimientos **ligados a órdenes**: **requieren servidor**.  
- **ABM de tipos de movimiento** (activar/desactivar, G/P, crear/editar tipo): la tabla y los guardados **requieren servidor**; sin conexión verás un mensaje en la grilla.

---

## 10. Otras pantallas y acciones que requieren servidor

Hasta que vuelva la conexión (y en algunos casos tocás **Reintentar**), **no** podrás completar en el servidor, entre otras:

- **Actualizar permisos** / refrescar rol desde el menú.  
- **Seguridad** (usuarios, roles, permisos, tiempo de sesión, comisión USD fija).  
- **Empresa / marca** — guardar configuración.  
- **Clientes**, **Intermediarios**, **Tipos de operación** (incl. orden visual), **Reglas de negocio** — guardar o refrescar listados.  
- **Anular orden**; **anular** movimiento manual de CC.  
- **Chat** — interpretar mensaje y confirmar orden desde chat.  
- **Órdenes pendientes** / **Transacciones pendientes** desde el panel de inicio como listados **en vivo** (si la app pide datos frescos).  
- **Guardar** cambios en movimientos de CC **asociados a instrumentación de orden** desde el flujo que pide servidor.

En todos esos casos la app usa **mensajes claros** y **Reintentar** en el aviso superior; no usa diálogos del navegador (`alert` / `confirm` del sistema) para el negocio.

---

## 11. Después de recuperar la conexión

- Tocá **Reintentar** en el banner si sigue visible.  
- El sistema **revisa periódicamente** el servicio; al volver, puede **enviar sola** colas pendientes (instrumentación parcheada, CC manual, caja manual) en un orden seguro.  
- Si la sesión llevaba **muchos días** offline, puede hacer falta **volver a iniciar sesión**.

---

## 12. Referencia para soporte / desarrollo

Detalle de claves técnicas, TTL y orden de sincronización: **`docs/PWA_OFFLINE_TECNICO.md`**.  
Plan histórico y estado del proyecto: **`docs/PLAN_PWA_OPERACION_OFFLINE.md`**.
