# Instrumentación manual multicontraparte — definiciones acordadas

**Estado:** implementado en app (`main.js`, `index.html`) + migraciones `sql/migracion_instrumentacion_multicontraparte.sql` y `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql` (este último corrige el `CHECK` que impedía dos roles `cliente` con entidades distintas). Ejecutar las migraciones en Supabase antes de usar el checkbox y las columnas en transacciones.

**Relacionado:** `docs/INSTRUMENTACION_MULTITRANSACCION_Y_CC.md`, `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/CC_MOVIMIENTO_MANUAL.md`, reglas en `reglas_de_negocio`.

---

## 1. Alcance (producto)

- **Todos los tipos de operación** con orden que tenga tipo cargado (`tipo_operacion_id` y join a `tipos_operacion`): el checkbox de instrumentación manual multicontraparte está disponible para modelar **N pagos** y **contrapartes explícitas** en CC (con o sin intermediario, CHEQUE-ARS, USD-USD, cruces con TC, etc.).
- La **plantilla sugerida** que el sistema borra al activar el flag depende del tipo (sin int.: ingreso C→P en moneda recibida + egreso P→C en moneda entregada; con int.: patas típicas **cp_ic** / **ci_pc**; CHEQUE-ARS + intermediario: cuatro filas ARS). Solo se eliminan transacciones que **sigan** coincidiendo con esa plantilla (montos y roles dentro de tolerancia).
- **Sin** multicontraparte manual, al crear esas plantillas por autocompletar instrumentación el sistema también persiste `pagador_cliente_id` / `cobrador_cliente_id` (cliente del acuerdo) y `pagador_intermediario_id` / `cobrador_intermediario_id` cuando el rol es intermediario (`plantillaTransaccionEnriquecerIdsParticipantesDesdeOrden` en `main.js`), para CC detalle y reglas que lean UUIDs; las filas viejas sin UUID siguen pudiendo corregirse con sync + completado de préstamo por fila CC.
- El **cierre por totales** y la **CC** en este modo siguen el mismo modelo de **dos monedas del acuerdo** (`monto_recibido` / `monto_entregado` y monedas) donde aplique; en tipos de una sola moneda o casos límite, la validación y el sync deben alinearse al comportamiento ya definido en `main.js` para `multicontraparte_manual`.

---

## 2. Actores en cada pata

- Puede ser indistintamente **Cliente del acuerdo ↔ Cliente N** o **Cliente del acuerdo ↔ Intermediario N** (alineado al manejo actual de saldos Pandy: CC cliente vs CC intermediario).
- Cada transacción debe llevar los **identificadores** necesarios (`cliente_id` / `intermediario_id` de quien participa además del acuerdo), porque **afecta las CC con Pandy** de esas fichas.

---

## 3. Cuenta corriente y leyendas

- **Disparo de la conciliación (momento 0):** con la **primera** transacción guardada en **pendiente**, el sync ya genera las filas CC que correspondan al modelo (ingreso monR / egreso monE del acuerdo, patas con intermediario, etc.) con `estado` **pendiente** en la fila donde aplique. Al pasar transacciones a **ejecutada**, el mismo sync **reconstruye** todo el lote (pendientes + ejecutadas) para mantener la conciliación.
- **Persistencia:** si con todas las transacciones de la instrumentación en estado ejecutada o anulada la CC derivada del cliente del acuerdo **no netea por moneda** (salvo residual permitido en **monR** por «Pandy / Tercero cumple pata», en **monE** por «Pandy cumple pata en moneda entregada» en el cruce USD-ARS/ARS-USD sin int. con doble pata empresa→cliente, y por la fila sintética «Comisión del acuerdo» sin `transaccion_id` cuando corresponde al spread mr−me), `sincronizarCcYCajaDesdeOrden` **no** guarda movimientos de CC/caja para esa orden hasta corregir datos o reglas — ver `validarInvarianteNeteoCcClienteAcuerdoCerrado` en `main.js`.
- **Clientes con Pandy en patas pendientes (MC, resumen del sync):** ingresos en **moneda recibida** aún **pendientes** con pagador = **cliente** (del acuerdo **u otro** cliente con `pagador_cliente_id`, p. ej. Lucas→Pandy) → **−monto** en la **CC de ese pagador** (concepto «Instrumentación pendiente»). Egresos en **moneda entregada** aún pendientes: con cobrador = **cliente** (acuerdo u otro con `cobrador_cliente_id`) → **+monto** en la CC de ese cobrador («Entrega … pendiente»); con pagador = **cliente** (acuerdo u otro, p. ej. varios egresos Cliente→Pandy que no excedan el acuerdo) → **−monto** en la CC de ese pagador («Instrumentación pendiente»). Así **N** ingresos y **N** egresos pendientes generan **una fila CC por transacción** en la ficha del cliente que corresponda. *Antes* solo se registraba la pata pendiente si el pagador/cobrador era el cliente del acuerdo; eso omitía terceros (orden 2: Lucas B sin fila CC). Un ingreso **ejecutado** del acuerdo hacia **otro cliente** (pago a tercero) se refleja con **−m y +m** en el libro del acuerdo (neteo local) más **+m** al cobrador tercero. **Pata en moneda recibida (excepción al neteo cero en monR en el libro del acuerdo):** con **pagador = Pandy** y cobrador rol **cliente**, la CC del acuerdo lleva **−m** «Compromiso de pago» con leyenda **«(Pandy cumple pata en moneda recibida)»** (MC/motor); el **+m** «Préstamo al cliente (cobertura Pandy — moneda recibida)» **misma transacción** lo completa `completarCcClientePrestamoReglaBPandyMonSiFalta` en el sync si faltaba (también cuando la matriz solo dejó «Compromiso de Pago» en −m sin esa leyenda). El **−m** refleja el cierre frente a la instrumentación; el **+m** la posición de préstamo operativo al cliente, **solo** si **`cobrador_cliente_id` coincide explícitamente** con el cliente del acuerdo (`multicontraparteEsCobradorClienteDelAcuerdoExplicito` en `main.js`); sin UUID no se asume el acuerdo (paridad con el motor: evita filas erróneas en CC del acuerdo cuando la liquidez va a **otro** cliente, p. ej. Madero). Con **otro cliente** pagando al cliente del acuerdo en monR (misma familia), **+m** «Compromiso de pago» con **«(Tercero cumple pata en moneda recibida)»** y en el tercero **−m (Cobro realizado)** — **paridad** con el motor cuando no hay fila `cliente→cliente` en `reglas_de_negocio` (`aplicarMotorCcDesdeReglasDeNegocio`). Un ingreso **ejecutado** **acuerdo → Pandy** en monR lleva el **par −m/+m** en la CC del acuerdo (Cobro realizado + Ajuste libro), de modo que esa pata **netea en cero** en el libro del acuerdo. Un egreso **ejecutado** hacia el **cliente del acuerdo** en **moneda entregada** (pagador **Pandy** u **otro cliente**) lleva **−m (Pago realizado) +m (Ajuste libro acuerdo)** en la CC del acuerdo; si paga un tercero, además **−m (Cobro realizado)** en su CC (mismo criterio que Pandy pagador; evita saldo +m solo por «compromiso»).
- **Listado CC (Pagador / Cobrador):** «Instrumentación pendiente»: **Pagador** = el **cliente pagador** de la transacción (`pagador_cliente_id` o acuerdo si aplica); **Cobrador** = destino **concreto** del pago (`cobrador_cliente_id` / `cobrador_intermediario_id` o rol Pandy). «Entrega … pendiente»: **Cobrador** = cliente que recibe la entrega pendiente (acuerdo u otro). El resto de movimientos usa resolución estándar por transacción. **Ingreso ejecutado Pandy→cliente** (cualquier moneda de la trx, p. ej. ARS en un cruce con `moneda_recibida` USD): el cierre genérico a `cidCob` **no** aplica cuando el cobrador resuelto es el acuerdo **solo** por fallback sin `cobrador_cliente_id` explícito (evita «Compromiso de Pago» plano erróneo; la pata en **monR** al acuerdo va con leyenda regla B; otras monedas requieren UUID de cobrador o no generan esa fila genérica al acuerdo).
- **Terceros e intermediario en patas:** mismos criterios de signo **pagador − / cobrador +** donde aplique; patas con intermediario delegan en `aplicarCcMulticontraparteManualTrx`. **Ingreso ejecutado** con pagador = cliente del acuerdo y cobrador = intermediario lleva en la CC del acuerdo el mismo **neteo −m (cobro) +m (ajuste libro)** que el pago a otro cliente, más la línea en CC del intermediario. **Egreso ejecutado** con pagador = intermediario y cobrador = cliente del acuerdo (moneda entregada) lleva en la CC del acuerdo el mismo **−m (Pago realizado) +m (ajuste libro)** que **Pandy → cliente del acuerdo**, además de la línea en CC del intermediario (pago realizado −m); sin ese par el libro del acuerdo quedaba solo en +compromiso y no neteaba.
- **Cruce USD-ARS / ARS-USD sin int., doble pata Pandy→cliente (monR + monE):** si hay ingreso ejecutado Pandy→cliente en monR (regla B, **cobrador_cliente_id = acuerdo**) y egreso ejecutado Pandy→cliente en monE (**mismo criterio explícito**), en monE **no** se aplica el par −m/+m de ajuste libro: una sola fila **−m** «Pago realizado» con leyenda «Pandy cumple pata en moneda entregada» (misma pata **−m** del par clásico, sin el +m de ajuste libro); el motor sin MC hace lo mismo. En `aplicarMotorCcDesdeReglasDeNegocio` ese atajo corre **antes** del chequeo «sin filas en `reglas_de_negocio`»: para ese egreso en monE suele no haber fila en la tabla y un orden incorrecto disparaba el toast aun con instrumentación válida. Con **instrumentación parcial** (una pata ejecutada y la otra pendiente), el gross monE y la fila regla B en monR siguen aplicando cuando la pata monR existe en pendiente o ejecutada (`transaccionesHayIngresoPandyClienteMonRAcuerdoActivo`); en **MC manual**, un ingreso Pandy→acuerdo en monR **pendiente** genera **−m** compromiso «Pandy cumple pata en moneda recibida»; el **+m** préstamo lo agrega el mismo paso `completarCcClientePrestamoReglaBPandyMonSiFalta` del sync (antes no entraba en el bloque pendiente y solo quedaba la pata monE).
- **Leyendas de saldo** (rojo / verde): **iguales que hoy**; los importes salen de movimientos + criterio de pendientes. En MC manual elegible, `contribucionPendienteCcUnificada` **no** duplica la exposición del acuerdo (las patas van en movimientos CC). Para cliente en **misma moneda** fuera de MC, la exposición parcial queda en filas CC `pendiente` tras sync, no en ajuste sintético cliente de esa función.

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
  - **USD-USD + MC + reglas (motor solo comisiones):** en monR, **−m** «Pandy cumple pata…» y **+m** préstamo misma transacción (`completarCcClientePrestamoReglaBPandyMonSiFalta`, `cobrador_cliente_id` explícito). La fila sintética **Comisión del acuerdo** (`mr−me`) sigue el signo de `reglas_de_negocio` (`main.js`).
  - **Resto del sistema (sin MC manual):** sigue contando solo transacciones donde participa el rol **cliente** en pagador o cobrador (patrón histórico); Pandy↔Intermediario no suman al cierre del acuerdo del cliente.

---

## 7. Modo manual vs resto del sistema

- La opción **instrumentación manual** es **totalmente manual y libre** hasta **cerrar el acuerdo** (validación por sumas y monedas), para cualquier tipo donde el producto habilite el checkbox.
- **El resto** del comportamiento del sistema **sin** el flag activo **queda como hasta ahora** (no se reemplaza la instrumentación sugerida globalmente).

### 7.1. Checkbox en el wizard: quitar la plantilla sugerida al activar

Al **activar** el checkbox (con confirmación), el front elimina las transacciones que **sigan** coincidiendo con la **plantilla estándar del tipo** (dos patas sin intermediario; dos patas cp_ic/ci_pc con int.; cuatro filas CHEQUE-ARS + intermediario; etc.). Si ya se cambió cobrador, pagador o moneda en una pata, esa transacción **no** califica y no se borra. Requiere permiso **eliminar transacciones**. Después se llama a **`sincronizarCcYCajaDesdeOrden`** y se refresca la instrumentación. Desactivar el checkbox solo apaga el flag (no recrea la plantilla).

### 7.2. Modal «Nueva transacción» (MC manual)

Al abrir **Nueva transacción** con el flag activo, se cargan las transacciones ya cargadas de la instrumentación y se sugiere el **restante** del acuerdo según la **suma de todos los ingresos / egresos** (misma regla que §6 para MC): mientras falte monto en moneda recibida, tipo **Ingreso** y monto = faltante; cuando ese lado está cubierto y falta moneda entregada, tipo **Egreso** y monto = faltante. En combinación **Cliente → Cliente**, el desplegable del cobrador **no** ofrece la opción genérica del acuerdo: hay que elegir un **tercero**; al guardar se exige `cobrador_cliente_id` y que sea distinto del pagador resuelto. El **sync CC/caja** por orden, si hay reglas para el tipo, añade **comisiones y líneas sintéticas** alineadas al caso **sin** multicontraparte (motor en modo solo comisiones tras el armado MC por transacción).

---

## 8. Implementación (nota técnica breve)

- Además de **pagador/cobrador editables** en UI, hace falta **persistir** en cada transacción **quién** es cada extremo cuando no basta el rol genérico (IDs de cliente/intermediario). En **Cliente→Cliente**, `cobrador_cliente_id` debe estar cargado: si falta, el sync no debe inferir el cobrador como `orden.cliente_id` (coincidiría con el pagador del acuerdo y la CC del acuerdo quedaría solo con −m sin el par +m de ajuste).
- En **esta** modalidad (flag `multicontraparte_manual` + orden con tipo de operación cargado), las **filas CC por transacción** se arman con **`aplicarCcMulticontraparteManualConciliacionCompleta`** en `sincronizarCcYCajaDesdeOrden`, para poder modelar **N** contrapartes y el neteo en el libro del acuerdo. Si existen filas en **`reglas_de_negocio`** para ese tipo (con o sin intermediario), el mismo sync invoca **`aplicarMotorCcDesdeReglasDeNegocio`** con **`soloComisiones: true`**: añade comisiones/tasas sintéticas (p. ej. spread USD-USD, cruces TC, CHEQUE-ARS) **sin** volver a recorrer transacciones (evita duplicar patas). El resto del sistema sin MC sigue usando el motor completo donde corresponda.
- Al **marcar una transacción como ejecutada** (`saveTransaccion`), el legado «momento cero» que insertaba **«Cobro por» / «Deuda por»** (y ciertas filas Pandy↔intermediario) **no** debe correr si el flag está activo: la CC de esa orden sale solo del resync (`sync_cc_caja_orden`); duplicar esas líneas rompía el neteo y dejaba filas `pendiente` desfasadas respecto de las transacciones ya ejecutadas.

---

## 9. Check en base `transacciones`

- El constraint `chk_transaccion_cobrador_pagador_distintos` no puede exigir solo `cobrador <> pagador` en texto de rol: en multicontraparte hacen falta **dos** filas con `pagador = cobrador = 'cliente'` y clientes distintos (NULL = cliente del acuerdo vs otro UUID). Ver script `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql`.

---

## 10. Historial

- 2026-03-24: Definiciones iniciales (alcance, actores, CC, caja, cierre, Fase 1).
- 2026-03-24: Cierre de definiciones (1) mismo signo CC acuerdo con n pagos; (2) IDs obligatorios; (3) suma ARS = compromiso cliente, suma USD = compromiso entrega Pandy / quien actúa en su nombre; (4) manual totalmente libre hasta cerrar acuerdo, resto igual.
- 2026-03-27: Migración `migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql`: el `CHECK` en BD alineado a dos clientes con rol `cliente` y UUID distintos.
- 2026-03-27: CC multicontraparte manual: modelo de conciliación completa (ARS/USD, pago a tercero −m/+m + línea al cobrador). **2026-04-07:** CC desde **todas pendientes** (momento 0), no solo tras la primera ejecutada.
- 2026-03-27: Ingreso ejecutado acuerdo→Pandy: par −m/+m (ajuste libro); vista CC: Pagador/Cobrador con semántica acuerdo↔empresa en conceptos pendiente y IDs explícitos en transacciones.
- 2026-03-27: CC «Instrumentación pendiente»: columna Cobrador = tercero de la trx (UUID), no solo empresa.
- 2026-03-27: Resumen CC cliente tercero: con solo movimientos cerrados (p. ej. ingreso ejecutado cobró el acuerdo→tercero), clase «cobro»/«pago» desde trx + IDs para que el importe y la leyenda no inviertan el signo del movimiento (+500k → verde Pendiente de cobro).
- 2026-03-27: Egreso ejecutado Pandy→acuerdo en moneda entregada (p. ej. USD): en CC del acuerdo par −m «Pago realizado» +m «Ajuste libro acuerdo» (neteo con instrumentación; saldo USD no queda solo en +compromiso).
- 2026-04-09 (ter): Motor + MC: ingreso **tercero → acuerdo** en monR con **+m** compromiso leyenda «Tercero cumple pata» en CC acuerdo y **−m** cobro en tercero; motor inserta lo mismo si no hay fila `cliente→cliente` en `reglas_de_negocio`. Invariante neteo: offset monR incluye leyendas Pandy o Tercero «cumple pata».
- 2026-04-09 (bis): Antes de `sync_cc_caja_orden`, `validarInvarianteNeteoCcClienteAcuerdoCerrado` bloquea la persistencia si la CC del cliente del acuerdo no netea (excepción monR = leyendas Pandy o Tercero «cumple pata»; también orden ejecutada + todas trx ej.).
- 2026-04-09: Ingreso ejecutado **acuerdo → Pandy** (monR): de vuelta el par **−m Cobro realizado +m Ajuste libro** en CC del acuerdo (**neteo cero** de esa pata). Ingreso **otro cliente → acuerdo** (monR): mismo neteo en libro del acuerdo + −m en tercero. **Regla B** queda **solo** con **pagador Pandy** → cobrador acuerdo (+m compromiso con leyenda).
- 2026-04-08: (revertido respecto de neteo acuerdo→Pandy / tercero→acuerdo; ver 2026-04-09.) Ingreso ejecutado acuerdo → Pandy (monR): brevemente solo +m Ajuste sin −m.
- 2026-04-07: Ingreso ejecutado **acuerdo → Pandy** (monR): par −m/+m para **neteo en cero** de esa pata.
- 2026-04-07: Totales MC en UI: suma de **todos** los ingresos (moneda IN) y egresos (moneda OUT), sin filtrar por «solo pagador del acuerdo» en ingresos — permite ingreso con pagador Pandy; excluye trx anuladas. `totalesInstrumentacion` + doc §6.
- 2026-04-12: CC MC **pendiente**: ingreso monR y egreso monE con cliente pagador/cobrador **cualquiera** (no solo el cliente del acuerdo), para alinear con totales §6 y con patas tipo Lucas→Pandy (`aplicarCcMulticontraparteManualConciliacionCompleta` en `main.js`).
- 2026-04-12 (bis): Egreso pendiente monE con **pagador** cliente (N egresos C→Pandy, etc.) → **−m** «Instrumentación pendiente» en la CC de ese pagador; además del **+m** al cobrador cliente cuando aplica.
- 2026-04-12 (ter): MC + **`reglas_de_negocio`**: comisiones como sin MC (`aplicarMotorCcDesdeReglasDeNegocio` **soloComisiones** tras conciliación MC; sin fallback CHEQUE duplicado en CC; caja comisión int. CHEQUE cuando par cliente cerrado). §7.2, §8 y `CUENTA_CORRIENTE_Y_CAJA`.
- 2026-04-12 (sex): **MC + reglas USD-USD:** con `aplicarMotorCcDesdeReglasDeNegocio` en modo `soloComisiones` **no** se emite la fila sintética cliente de comisión implícita `mr−me` (el libro del acuerdo ya sale de `aplicarCcMulticontraparteManualConciliacionCompleta` + patas; duplicar +20 rompía `validarInvarianteNeteoCcClienteAcuerdoCerrado` y bloqueaba `sync_cc_caja_orden`). Siguen comisiones en CC intermediario y `comisiones_orden`.
- 2026-04-12 (quin): **Estado en `transacciones`:** en sync CC/caja cada fila se normaliza con `transaccionNormalizarPagCobVacios` (incluye `trim` en `estado` si es string) y las comparaciones de ejecutada/pendiente usan `transaccionEstadoTextoNormalizado` en motor, contrapartida, par cliente USD-USD y multicontraparte manual. Evita filas CC «pendiente» o comisión en pendiente cuando el valor en base/API trae espacios (`ejecutada `, etc.).
- 2026-04-12 (qua): **saveTransaccion** con MC activo: no insertar «Cobro por»/«Deuda por» ni duplicar CC int. Pandy↔int. al pasar trx a ejecutada (evitaba neteo + sync; filas pendientes vs trx ejecutadas). `transaccionNormalizarPagCobVacios` en bucle MC / `aplicarCcMulticontraparteManualTrx`.
- 2026-04-01: Alcance ampliado a **todos los tipos de operación** con tipo cargado; detección de plantilla a borrar por tipo (sin int., con int. cp_ic/ci_pc, CHEQUE-ARS+int. cuatro filas); `actualizarEstadoOrden` y selects de orden con `tipo_operacion_id`; textos UI y doc alineados.
- 2026-03-29: Activar multicontraparte manual en el wizard: confirmación; borrado de transacciones que sigan siendo la plantilla C→Pandy (monR) y Pandy→C (monE); sync CC/caja; permiso eliminar transacciones.
- 2026-03-29: CC sync ingreso ejecutado acuerdo→tercero: si el cobrador es rol `cliente` y el UUID del cobrador falta o es distinto del acuerdo, siempre par Cobro realizado + Ajuste libro (+ línea al tercero si hay UUID). Modal nueva trx MC: sugiere restante en monR luego pasa a egreso monE; Cliente→Cliente sin opción «acuerdo» como cobrador; validación al guardar.
- 2026-03-29: CC MC ingreso ejecutado acuerdo→intermediario: en `aplicarCcMulticontraparteManualTrx`, además de la línea en CC intermediario, par −m/+m en CC del cliente del acuerdo (antes solo quedaba −m).
- 2026-03-29: CC MC egreso ejecutado intermediario→cliente del acuerdo: par −m «Pago realizado» +m «Ajuste libro acuerdo» en CC del acuerdo (antes solo «Compromiso de Pago» +m). Fechas de negocio (`fecha_ejecucion`, orden, caja, fallbacks sync): `fechaHoyYYYYMMDDArgentina()` en `main.js` en lugar del día UTC del navegador.
- 2026-03-30: CC MC egreso ejecutado **cliente tercero → cliente del acuerdo** en monE: mismo par −m/+m en CC del acuerdo que con Pandy pagador (`aplicarCcMulticontraparteManualConciliacionCompleta`); evita saldo +m huérfano cuando dos egresos cubren la entrega (p. ej. Santi + Cheques/Pandy hacia Fede).
- 2026-03-29: Modal «Nueva transacción» MC cuando falta moneda entregada: ya no precarga **Pandy→Cliente** (generaba `movimientos_caja` aunque en la realidad pagara un tercero). Precarga **Cliente→Cliente**, modo «Otro cliente pagador», cobrador por defecto = cliente del acuerdo (recibe); combo cobrador permite acuerdo si el pagador es otro cliente. Opción «(acuerdo)» del cobrador con `value` = UUID para persistir `cobrador_cliente_id`.
