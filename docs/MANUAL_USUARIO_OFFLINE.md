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
- **Panel de inicio:** tarjetas de **caja** (movimientos cerrados), **G/P operativa** (por período día / semana / mes / total). La primera fila **P&L (devengado)** suma **libro + caja por órdenes** (CC clientes e intermediarios en flujo, resultado económico compensatorio, comisiones del acuerdo —intermediario en **negativo**— y caja con orden **cerrada** al ejecutar transacciones). **Caja manual** (sin orden, según tipo «incluye en G/P») va aparte como **liquidez**. Desglose por bolsa y snapshot offline alineados a esa matriz. Bloque **Pendientes**.  
- **Vista Cajas:** tabla de movimientos y totales según la copia.  
- **Vista Cuenta corriente:** resumen y movimientos según la copia y filtros que ya tenías (incluye la búsqueda por nombre en **Saldos** si la usaste). Con el tipo **Cliente**, en **Saldos** la copia omite al cliente vinculado 1:1 con un intermediario (misma fila unificada en **Intermediario** o **Total**); en **Movimientos**, si ya habías cargado ese cliente con red, la copia puede incluir su libro de `movimientos_cuenta_corriente` (p. ej. patas pendientes de órdenes). El **saldo por moneda** en Saldos, en el detalle (ojo) y en totales de Movimientos **incluye líneas pendientes** no anuladas; en el modal de detalle también se muestra un **subtotal aparte de solo lo pendiente**. **Con red**, al abrir la vista puede verse un momento el estado de carga (spinner) mientras la app alinea movimientos con las órdenes (varias órdenes en paralelo; si en esta sesión acaba de completarse un sync global, a veces se omite repetirlo unos segundos para abrir más rápido — usá **Refrescar** si querés forzar siempre el recálculo completo). Recién después se muestran saldos y tablas, para que no aparezcan cifras intermedias incorrectas. El botón **Refrescar** (Saldos o Movimientos) hace esa misma **alineación** otra vez: recalcula CC y caja desde **todas** las órdenes con instrumentación; **no** necesitás entrar a instrumentación ni pulsar Guardar en cada orden para que se apliquen reglas o código nuevos del servidor. La columna **Usuario** en cada movimiento derivado de una orden muestra quien **ejecutó o grabó la transacción** correspondiente (o el creador de la orden en líneas sin transacción propia), no a la persona que solo abrió la pantalla o pulsó Refrescar.  
- **Órdenes en el servidor — panel Transacciones** (fila expandida): si antes abriste **Transacciones** con red, suele haber **instrumentación en caché** por orden; se puede combinar con cambios locales pendientes de envío (ver §7).

**Exportar a Excel** (Caja, CC, etc.): si los datos ya están cargados en pantalla, el export usa esa información; no crea datos nuevos en el servidor.

---

## 6. Escribir: órdenes nuevas y cola local

### 6.1 Cola simple — «Orden en cola local»

Desde **Órdenes**, botón para abrir el **formulario reducido** (tipo, fechas, participantes, montos, etc.). Los datos usan el **catálogo en caché** (clientes, intermediarios, tipos, modos de pago). **Cliente obligatorio:** toda orden (incluida la cola simple y la plantilla del wizard) debe tener un cliente elegido; el intermediario se suma cuando el tipo de operación lo exige. Si el tipo **usa intermediario** y elegís como intermediario al **mismo** sujeto vinculado en «mismo registro» que el cliente, la app **avisará** y **no permitirá** guardar: usá el **mismo tipo sin intermediario** y armá la operación como **multiparte** en instrumentación. Si el intermediario **no** es el del vínculo de ese cliente, no aplica. Podés:

- Guardar ítems en la cola de **este navegador**.  
- Ver el **resumen**, **quitar** un ítem solo de la cola (no borra Supabase).  
- **Descargar JSON** de respaldo.  
- Con conexión: **Enviar cola local** (importa en orden; si algo falla, los mensajes y la cola te orientan).

En el **wizard de Nueva orden**, tipo **USD-USD** (con o sin intermediario), en **Datos del acuerdo** podés elegir si la **tasa al cliente** se interpreta como **descuento sobre lo recibido** o como **incremento sobre lo entregado** (inclusiva); el importe sigue siendo lo que recibe el cliente y el sistema calcula el monto a entregar según esa elección. Las tasas en **%** permiten **hasta 6 decimales**. Podés editar también **«Comisión a Recibir»** (el spread en USD): se escribe con el **mismo criterio que el importe** (miles con punto, decimales con coma). Al **salir del campo** o confirmar con **Enter**, el sistema **ajusta la tasa al cliente** para que cuadre con el modo elegido; los cambios quedan trazados en auditoría al confirmar el campo y al guardar la orden.

Cuando el acuerdo tiene **comisión** (spread o beneficio repartido entre la **empresa** —nombre configurado en Empresa / marca— y el **intermediario** si corresponde), debajo de los montos calculados podés ver el **desglose informativo** de esas comisiones antes de guardar. En el paso **Instrumentación** del mismo wizard (bloque gris bajo «Acuerdo:»), se muestra el mismo desglose según lo ya guardado en el servidor. En **Órdenes**, al desplegar **Transacciones** en una fila, el desglose aparece bajo el resumen del acuerdo (en caché offline se incluye si ya se había cargado con red). En el **listado principal** de Órdenes también hay columnas **Multi** (Sí/No en recuadros de color: celeste = Sí, gris = No; multicontraparte manual en la instrumentación; leyenda «?» en el encabezado), **comisión a la empresa** y **comisión al intermediario** (totales por moneda según lo guardado en el servidor) y un botón **Exportar** para bajar un Excel con el mismo filtro que ves en pantalla. Lo mismo aplica al **modal Órdenes pendientes** (desde el panel de inicio): mismas columnas (incl. Multi y comisiones) y exportación Excel con los filtros del modal. En el listado principal de **Órdenes** podés **ordenar por columna** tocando el encabezado (flechas ▲/▼), igual que en **Cuenta corriente → Movimientos**; **Exportar** respeta el orden mostrado.

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
- **Con red**, si todavía no hay transacciones y el tipo de orden admite **plantilla automática**, el paso **Instrumentación** del wizard (y el panel **Transacciones** desplegado en la fila) muestran un **aviso de “generando instrumentación sugerida”** mientras el sistema crea las filas en el servidor; al terminar, la vista **se desplaza** para dejar bien visible la **tabla** dentro del alto útil del modal.

---

## 8. Cuenta corriente — movimiento manual

- **Instrumentación y CC (con red):** al guardar transacciones, el sistema **regenera** la cuenta corriente de la orden. Las transacciones en **pendiente** ya pueden dejar **movimientos** en CC (marcados como pendientes en el libro); la **caja** de la empresa sigue moviéndose cuando la transacción pasa a **ejecutada**. En **multicontraparte manual** también aplica desde el primer guardado, aunque todas las patas sigan pendientes.
- **Avisos al recalcular CC desde órdenes (con red):** si la instrumentación de una orden no encaja con ninguna **regla de negocio** del tipo correspondiente (cuando corre el motor de reglas), la app puede mostrar un **mensaje de error** (con detalle en la consola del navegador, F12). El aviso de que la CC del cliente **«no netea a cero con el acuerdo cerrado»** solo se evalúa cuando **no queda ninguna transacción en pendiente** (todas ejecutada o anulada, al menos una ejecutada) **y** además: **multicontraparte manual** con todas esas transacciones listas, **o** (sin multicontraparte) **par clásico** con ingreso cobro y egreso de entrega ya ejecutados, **o** la orden está en **orden ejecutada** / **instrumentación cerrada**. Si en ese punto la cuenta corriente del **cliente del acuerdo** no **netea a cero** en alguna moneda —salvo en moneda recibida las filas con leyenda **«Pandy cumple pata»** o **«Tercero cumple pata»**— **no se guardan** los movimientos de CC/caja de esa orden en ese recálculo y verás el mensaje. **No** debería aparecer a mitad de instrumentación solo porque marcaste ejecutadas dos patas y otras siguen pendientes. Suele indicar reglas o datos a corregir cuando el acuerdo ya está completo según esos criterios — no es un fallo de red.
- **Nuevo** movimiento manual: si en ese momento **no** se considera seguro guardar directo en servidor (sin red o conectividad degradada), el movimiento puede **guardarse en cola local** del dispositivo; en el detalle aparecen filas **«Sin sincronizar»** (con opción de quitar de la cola). Al volver la conexión estable, se **reenvían** y recién ahí aplican reglas y validaciones fuertes (incl. **caja** si el flujo lleva efectivo a caja).  
- **Editar o anular** un movimiento manual **ya guardado en servidor**: **requieren servidor**.

---

## 9. Cajas — movimiento manual

- **Alta** de movimiento **solo caja** (no CC): en condiciones offline admitidas, puede **encolarse** de forma análoga a CC manual; filas **Sin sincronizar**; **egresos** pueden validarse contra **última información conocida** de caja **más** movimientos pendientes en cola.  
- **Editar** un movimiento de caja **ya en servidor** o movimientos **ligados a órdenes**: **requieren servidor**.  
- **ABM de tipos de movimiento** (activar/desactivar, G/P, crear/editar tipo): la tabla y los guardados **requieren servidor**; sin conexión verás un mensaje en la grilla.
- **Tabla Movimientos de caja** (solapa con la lista): podés **ordenar por columna** tocando el encabezado (▲/▼), como en **Cuenta corriente → Movimientos**; **Exportar a Excel** usa el mismo filtro y el **mismo orden** que la tabla en pantalla.

---

## 10. Otras pantallas y acciones que requieren servidor

Hasta que vuelva la conexión (y en algunos casos tocás **Reintentar**), **no** podrás completar en el servidor, entre otras:

- **Actualizar permisos** / refrescar rol desde el menú.  
- **Seguridad** (usuarios, **nombre visible** por usuario, roles, permisos, tiempo de sesión, comisión USD fija).  
- **Auditoría** (menú lateral, permiso **ver_auditoria**): listado de acciones sensibles en el servidor; filtros por fechas, categoría, acción y texto en detalle; **Cargar más** para el siguiente lote; **Ver** abre el detalle con **cuándo**, **quién** y tabla de cambios en lenguaje claro (nombres de cliente, intermediario, tipo de operación, modo de pago, etc.; sin UUID en la tabla principal); el JSON técnico va aparte, colapsado. **Exportar a Excel** el lote acumulado en la búsqueda actual. Sin conexión no se puede consultar.  
- **Control de calidad** (menú lateral, permiso **ver_control_calidad**; quien tenía el permiso heredado de control G/P puede seguir entrando): informe por período (día / semana / mes / total) con parejas **cuenta corriente ↔ caja** (tablas de CC **cliente** e **intermediario**) y chequeos de transacciones frente a **ambos** libros de CC por **fecha de orden** (incluye órdenes anuladas): ejecutadas o pendientes **sin ningún** movimiento no anulado donde corresponda; si hay movimientos, que en **ejecutada** todo lo no anulado esté **cerrado** y en **pendiente** todo **pendiente**; y, si la transacción está **anulada**, que haya registro en CC y que lo derivado del motor (no manual) quede **anulado**. Sin conexión no se puede cargar.  
- **Empresa / marca** — guardar configuración.  
- **Clientes**, **Intermediarios**, **Tipos de operación** (incl. orden visual), **Reglas de negocio** — guardar o refrescar listados.
- **Mismo cliente que intermediario:** si tenés permiso de ABM de **clientes** o de **intermediarios**, al **editar** un cliente o un intermediario podés elegir **«Mismo registro que…»** para indicar que es la misma persona en otro circuito (vínculo 1:1 en el servidor). Los listados muestran el nombre vinculado. En **Cuenta corriente → Saldos** con el tipo **Cliente**, **no** aparece esa persona como fila de resumen (solo clientes **sin** vínculo); en **Movimientos** con filtro **Cliente** podés ver las filas de CC de ese cliente aunque esté vinculado (libro persistido). La posición unificada de **saldos** la seguís viendo con **Intermediario** o **Total**. Con el tipo **Intermediario**, la fila de ese intermediario y su detalle incluyen también los movimientos de CC cliente del par (vista unificada para la misma persona, sin duplicar datos en el servidor). Con el tipo **Total** ves la posición **consolidada sin duplicar** esa persona en **Saldos**: una sola vez como en la fila intermediario, y los clientes **sin** vínculo siguen en su fila cliente. En **Nueva orden**, si el tipo **usa intermediario** no podés dejar **cliente** e **intermediario** exactamente en ese par vinculado: la app te pide **tipo sin intermediario** y **multiparte**. Si cargaste la orden con dos registros distintos antes de crear el vínculo, completá el vínculo en Clientes/Intermediarios y editá la orden según corresponda.  
- **Anular orden** (pasa la orden y la instrumentación a anulada y **vuelve a sincronizar** la CC/caja derivada de esa orden: verás movimientos en **Anulada** que no suman al saldo); **anular** movimiento manual de CC.  
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
