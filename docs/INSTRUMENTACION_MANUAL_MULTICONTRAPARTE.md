# Instrumentación manual multicontraparte — definiciones acordadas

**Estado:** implementado en app (`main.js`, `index.html`) + migraciones `sql/migracion_instrumentacion_multicontraparte.sql` y `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql` (este último corrige el `CHECK` que impedía dos roles `cliente` con entidades distintas). Ejecutar las migraciones en Supabase antes de usar el checkbox y las columnas en transacciones.

**Relacionado:** `docs/INSTRUMENTACION_MULTITRANSACCION_Y_CC.md`, `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/CC_MOVIMIENTO_MANUAL.md`, reglas en `reglas_de_negocio`.

---

## 1. Alcance (producto)

- **Todos los tipos de operación** con orden que tenga tipo cargado (`tipo_operacion_id` y join a `tipos_operacion`): el checkbox de instrumentación manual multicontraparte está disponible para modelar **N pagos** y **contrapartes explícitas** en CC (con o sin intermediario, CHEQUE-ARS, USD-USD, cruces con TC, etc.).
- La **plantilla sugerida** que el sistema borra al activar el flag depende del tipo (sin int.: ingreso C→P en moneda recibida + egreso P→C en moneda entregada; con int.: patas típicas **cp_ic** / **ci_pc**; CHEQUE-ARS + intermediario: cuatro filas ARS). Solo se eliminan transacciones que **sigan** coincidiendo con esa plantilla (montos y roles dentro de tolerancia).
- El **cierre por totales** y la **CC** en este modo siguen el mismo modelo de **dos monedas del acuerdo** (`monto_recibido` / `monto_entregado` y monedas) donde aplique; en tipos de una sola moneda o casos límite, la validación y el sync deben alinearse al comportamiento ya definido en `main.js` para `multicontraparte_manual`.

---

## 2. Actores en cada pata

- Puede ser indistintamente **Cliente del acuerdo ↔ Cliente N** o **Cliente del acuerdo ↔ Intermediario N** (alineado al manejo actual de saldos Pandy: CC cliente vs CC intermediario).
- Cada transacción debe llevar los **identificadores** necesarios (`cliente_id` / `intermediario_id` de quien participa además del acuerdo), porque **afecta las CC con Pandy** de esas fichas.

---

## 3. Cuenta corriente y leyendas

- **Disparo de la conciliación:** mientras **todas** las transacciones de la instrumentación están **pendientes**, **no** se registran movimientos de CC para esa orden (el acuerdo aún no “arrancó” en el libro). En cuanto **al menos una** pasa a **ejecutada**, el sync arma la **conciliación completa** de una vez: pendientes y ejecutadas juntas, para que la **suma de movimientos** refleje saldos correctos (ARS y USD), sin el efecto de un saldo erróneo por contar solo pagos ejecutados.
- **Cliente del acuerdo con Pandy (resumen del modelo en sync):** ingresos en **moneda recibida** aún pendientes con pagador = cliente del acuerdo → **−monto** (obligación del cliente hacia Pandy en esa moneda). Egresos en **moneda entregada** aún pendientes con cobrador = cliente del acuerdo → **+monto** en CC (p. ej. **USD pendientes de entrega** quedan como línea en movimientos: deuda de Pandy hacia el cliente en esa moneda). Un ingreso **ejecutado** del acuerdo hacia **otro cliente** (pago a tercero) se refleja con **−m y +m** en el libro del acuerdo (neteo local) más **+m** al cobrador tercero. Un ingreso **ejecutado** **acuerdo → Pandy** lleva otra vez el par **−m (Cobro realizado) +m (Ajuste libro acuerdo)** en la CC del cliente del acuerdo: **netea en cero** esa pata para que el saldo USD no sume dos veces el monto frente a otras patas del mismo acuerdo (p. ej. un ingreso **Pandy → acuerdo** en monR queda como **+m** y define el neto, p. ej. 300 a favor de Pandy). Un egreso **ejecutado** hacia el **cliente del acuerdo** en **moneda entregada** (pagador **Pandy** u **otro cliente**) lleva **−m (Pago realizado) +m (Ajuste libro acuerdo)** en la CC del acuerdo; si paga un tercero, además **−m (Cobro realizado)** en su CC (mismo criterio que Pandy pagador; evita saldo +m solo por «compromiso»).
- **Listado CC (Pagador / Cobrador):** «Instrumentación pendiente»: **Pagador** = cliente del acuerdo (quien honra el compromiso con la empresa); **Cobrador** = destino **concreto** del pago derivado (`cobrador_cliente_id` / `cobrador_intermediario_id` de la transacción si existen; si no, rol de la trx). «Entrega … pendiente»: empresa → cliente del acuerdo. El resto de movimientos usa resolución estándar por transacción.
- **Terceros e intermediario en patas:** mismos criterios de signo **pagador − / cobrador +** donde aplique; patas con intermediario delegan en `aplicarCcMulticontraparteManualTrx`. **Ingreso ejecutado** con pagador = cliente del acuerdo y cobrador = intermediario lleva en la CC del acuerdo el mismo **neteo −m (cobro) +m (ajuste libro)** que el pago a otro cliente, más la línea en CC del intermediario. **Egreso ejecutado** con pagador = intermediario y cobrador = cliente del acuerdo (moneda entregada) lleva en la CC del acuerdo el mismo **−m (Pago realizado) +m (ajuste libro)** que **Pandy → cliente del acuerdo**, además de la línea en CC del intermediario (pago realizado −m); sin ese par el libro del acuerdo quedaba solo en +compromiso y no neteaba.
- **Leyendas de saldo** (rojo / verde): **iguales que hoy**; los importes salen de movimientos + criterio de pendientes **sin duplicar** el ajuste de resumen cuando la orden es MC manual elegible (`contribucionPendienteCcUnificada` omite el delta cliente duplicado).

---

## 4. Caja

- **Solo** entra caja cuando participa **Pandy** y el modo es **efectivo**; en **todo** otro caso **no** (confirmado).

---

## 5. Lado USD (entrega)

- **Conceptualmente igual** que el lado ARS: multi-origen / multi-destino permitido según instrumentación.
- **Compromiso en USD:** la **suma** de las transacciones en **USD** debe cumplir el **compromiso de entrega** atribuido a **Pandy** en el acuerdo; lo demás es **quién actúa en nombre de Pandy** (p. ej. otros clientes que pagan USD al cliente del acuerdo), siempre sujeto a que **cierre** el total USD del acuerdo.

---

## 6. Cierre del acuerdo

- El acuerdo **solo queda cerrado / instrumentado correctamente** si se cumplen los **totales** del acuerdo: **tantos ARS** y **tantos USD** como definen `monto_recibido` / `monto_entregado` y monedas — **mismo criterio que hoy**, aplicado a la **suma** de las N transacciones relevantes:
  - **Modo multicontraparte manual:** en la UI y en `totalesInstrumentacion` con `totalesMulticontraparte`, la suma del lado **recibido** es **todos** los movimientos tipo **ingreso** (cada monto convertido a `moneda_recibida` con `tipo_cambio` de la trx o cotización del acuerdo) y la del lado **entregado** es **todos** los **egreso** hacia `moneda_entregada` — **sin** exigir que el pagador del ingreso sea el cliente del acuerdo (Pandy/Madero puede figurar como pagador en un ingreso si el negocio lo modela así). No se cuentan transacciones **anuladas**.
  - **Resto del sistema (sin MC manual):** sigue contando solo transacciones donde participa el rol **cliente** en pagador o cobrador (patrón histórico); Pandy↔Intermediario no suman al cierre del acuerdo del cliente.

---

## 7. Modo manual vs resto del sistema

- La opción **instrumentación manual** es **totalmente manual y libre** hasta **cerrar el acuerdo** (validación por sumas y monedas), para cualquier tipo donde el producto habilite el checkbox.
- **El resto** del comportamiento del sistema **sin** el flag activo **queda como hasta ahora** (no se reemplaza la instrumentación sugerida globalmente).

### 7.1. Checkbox en el wizard: quitar la plantilla sugerida al activar

Al **activar** el checkbox (con confirmación), el front elimina las transacciones que **sigan** coincidiendo con la **plantilla estándar del tipo** (dos patas sin intermediario; dos patas cp_ic/ci_pc con int.; cuatro filas CHEQUE-ARS + intermediario; etc.). Si ya se cambió cobrador, pagador o moneda en una pata, esa transacción **no** califica y no se borra. Requiere permiso **eliminar transacciones**. Después se llama a **`sincronizarCcYCajaDesdeOrden`** y se refresca la instrumentación. Desactivar el checkbox solo apaga el flag (no recrea la plantilla).

### 7.2. Modal «Nueva transacción» (MC manual)

Al abrir **Nueva transacción** con el flag activo, se cargan las transacciones ya cargadas de la instrumentación y se sugiere el **restante** del acuerdo según la **suma de todos los ingresos / egresos** (misma regla que §6 para MC): mientras falte monto en moneda recibida, tipo **Ingreso** y monto = faltante; cuando ese lado está cubierto y falta moneda entregada, tipo **Egreso** y monto = faltante. En combinación **Cliente → Cliente**, el desplegable del cobrador **no** ofrece la opción genérica del acuerdo: hay que elegir un **tercero**; al guardar se exige `cobrador_cliente_id` y que sea distinto del pagador resuelto.

---

## 8. Implementación (nota técnica breve)

- Además de **pagador/cobrador editables** en UI, hace falta **persistir** en cada transacción **quién** es cada extremo cuando no basta el rol genérico (IDs de cliente/intermediario). En **Cliente→Cliente**, `cobrador_cliente_id` debe estar cargado: si falta, el sync no debe inferir el cobrador como `orden.cliente_id` (coincidiría con el pagador del acuerdo y la CC del acuerdo quedaría solo con −m sin el par +m de ajuste).
- En **esta** modalidad (flag `multicontraparte_manual` + orden con tipo de operación cargado), la CC de la orden se arma con **`aplicarCcMulticontraparteManualConciliacionCompleta`** en `sincronizarCcYCajaDesdeOrden` (no el motor **`reglas_de_negocio`**), para poder modelar **N** contrapartes y el neteo en el libro del acuerdo. El resto del sistema sigue usando reglas donde corresponda.

---

## 9. Check en base `transacciones`

- El constraint `chk_transaccion_cobrador_pagador_distintos` no puede exigir solo `cobrador <> pagador` en texto de rol: en multicontraparte hacen falta **dos** filas con `pagador = cobrador = 'cliente'` y clientes distintos (NULL = cliente del acuerdo vs otro UUID). Ver script `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql`.

---

## 10. Historial

- 2026-03-24: Definiciones iniciales (alcance, actores, CC, caja, cierre, Fase 1).
- 2026-03-24: Cierre de definiciones (1) mismo signo CC acuerdo con n pagos; (2) IDs obligatorios; (3) suma ARS = compromiso cliente, suma USD = compromiso entrega Pandy / quien actúa en su nombre; (4) manual totalmente libre hasta cerrar acuerdo, resto igual.
- 2026-03-27: Migración `migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql`: el `CHECK` en BD alineado a dos clientes con rol `cliente` y UUID distintos.
- 2026-03-27: CC multicontraparte manual: sin movimientos hasta la primera trx ejecutada; luego conciliación completa (ARS pendientes, USD pendiente al acuerdo en movimientos, pago a tercero −m/+m + línea al cobrador); resumen CC sin doble conteo con movimientos sincronizados.
- 2026-03-27: Ingreso ejecutado acuerdo→Pandy: par −m/+m (ajuste libro); vista CC: Pagador/Cobrador con semántica acuerdo↔empresa en conceptos pendiente y IDs explícitos en transacciones.
- 2026-03-27: CC «Instrumentación pendiente»: columna Cobrador = tercero de la trx (UUID), no solo empresa.
- 2026-03-27: Resumen CC cliente tercero: con solo movimientos cerrados (p. ej. ingreso ejecutado cobró el acuerdo→tercero), clase «cobro»/«pago» desde trx + IDs para que el importe y la leyenda no inviertan el signo del movimiento (+500k → verde Pendiente de cobro).
- 2026-03-27: Egreso ejecutado Pandy→acuerdo en moneda entregada (p. ej. USD): en CC del acuerdo par −m «Pago realizado» +m «Ajuste libro acuerdo» (neteo con instrumentación; saldo USD no queda solo en +compromiso).
- 2026-04-07: Ingreso ejecutado **acuerdo → Pandy** (monR): se mantiene el par −m/+m (Cobro realizado + Ajuste libro) para **neteo en cero** de esa pata; evita sumar +500 y +300 y desbalancear el saldo USD (el neto entre patas queda coherente, p. ej. 300 a favor de Pandy según el otro ingreso en monR).
- 2026-04-07: Totales MC en UI: suma de **todos** los ingresos (moneda IN) y egresos (moneda OUT), sin filtrar por «solo pagador del acuerdo» en ingresos — permite ingreso con pagador Pandy; excluye trx anuladas. `totalesInstrumentacion` + doc §6.
- 2026-04-01: Alcance ampliado a **todos los tipos de operación** con tipo cargado; detección de plantilla a borrar por tipo (sin int., con int. cp_ic/ci_pc, CHEQUE-ARS+int. cuatro filas); `actualizarEstadoOrden` y selects de orden con `tipo_operacion_id`; textos UI y doc alineados.
- 2026-03-29: Activar multicontraparte manual en el wizard: confirmación; borrado de transacciones que sigan siendo la plantilla C→Pandy (monR) y Pandy→C (monE); sync CC/caja; permiso eliminar transacciones.
- 2026-03-29: CC sync ingreso ejecutado acuerdo→tercero: si el cobrador es rol `cliente` y el UUID del cobrador falta o es distinto del acuerdo, siempre par Cobro realizado + Ajuste libro (+ línea al tercero si hay UUID). Modal nueva trx MC: sugiere restante en monR luego pasa a egreso monE; Cliente→Cliente sin opción «acuerdo» como cobrador; validación al guardar.
- 2026-03-29: CC MC ingreso ejecutado acuerdo→intermediario: en `aplicarCcMulticontraparteManualTrx`, además de la línea en CC intermediario, par −m/+m en CC del cliente del acuerdo (antes solo quedaba −m).
- 2026-03-29: CC MC egreso ejecutado intermediario→cliente del acuerdo: par −m «Pago realizado» +m «Ajuste libro acuerdo» en CC del acuerdo (antes solo «Compromiso de Pago» +m). Fechas de negocio (`fecha_ejecucion`, orden, caja, fallbacks sync): `fechaHoyYYYYMMDDArgentina()` en `main.js` en lugar del día UTC del navegador.
- 2026-03-30: CC MC egreso ejecutado **cliente tercero → cliente del acuerdo** en monE: mismo par −m/+m en CC del acuerdo que con Pandy pagador (`aplicarCcMulticontraparteManualConciliacionCompleta`); evita saldo +m huérfano cuando dos egresos cubren la entrega (p. ej. Santi + Cheques/Pandy hacia Fede).
- 2026-03-29: Modal «Nueva transacción» MC cuando falta moneda entregada: ya no precarga **Pandy→Cliente** (generaba `movimientos_caja` aunque en la realidad pagara un tercero). Precarga **Cliente→Cliente**, modo «Otro cliente pagador», cobrador por defecto = cliente del acuerdo (recibe); combo cobrador permite acuerdo si el pagador es otro cliente. Opción «(acuerdo)» del cobrador con `value` = UUID para persistir `cobrador_cliente_id`.
