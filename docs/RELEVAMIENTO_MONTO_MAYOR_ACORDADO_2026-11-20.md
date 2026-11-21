# "Monto mayor al acordado": qué significa por tipo de operación y por qué USD-USD parece tener excepciones

Relevamiento **solo lectura** (código, docs y SELECT en Pandy prod) — 20/11/2026. Analista funcional + criterio auditor CC/caja. **No se modificó código ni datos.**

## 1. Resumen ejecutivo

- **La regla ingenua estaba mal planteada; los datos están bien.** Medía por moneda y pagador/cobrador = cliente; el sistema mide por **`tipo`** (ingreso suma a lo recibido `mr`, egreso a lo entregado `me`), sin importar el sentido de la pata.
- **Con la definición que ya usa la app (`totalesInstrumentacion`), en prod hay 0 órdenes vivas excedidas sobre 962**: las 962 están conciliadas exactas (diferencia máxima 0,0000).
- **Por qué "falla" USD-USD (y CHEQUE-ARS):** `mr` y `me` están en la misma moneda y en la operatoria es normal **invertir el sentido** de una pata: ingreso Pandy→Cliente = "Pandy cumple pata" (préstamo/compensación) y egreso Cliente→Pandy = "el cliente deja la entrega a cuenta" (prevé `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md` §3 y §6). Filtrar por moneda y por cliente cuenta esa pata del lado equivocado → recibido ≈ 2×mr o entregado ≈ mr+me.
- **Hoy hay control solo en el modal** (`saveTransaccion` → `validarTotalesVsAcuerdo`). Editar el monto en la tabla (`guardarSoloMontoTransaccion`) y cambiar el estado (`cambiarEstadoTransaccion`) **no validan**; la RPC y la base tampoco. Por eso el 1.100 se guarda.
- **Por qué CC y caja no cambiaron en la prueba:** en USD-ARS sin intermediario y sin multicontraparte (MC), el sync se **auto-bloquea** por el invariante de neteo (residual −100 USD → no llama a la RPC). En otros patrones (p. ej. USD-ARS con intermediario ci_pc) las reglas valúan la pata con `mr` y la CC queda **topeada** en el acuerdo sin aviso. Con MC el invariante se omite y la CC sí se movería por el exceso.
- **Recomendación:** bloqueo duro por **tipo** de transacción en todos los puntos de escritura del front, reusando `validarTotalesVsAcuerdo`; luego una guarda en base. **Es seguro: no afecta ninguna orden existente.**

## 2. Modelo por tipo

| Tipo | Qué es mr / me | Plantilla (autocompletar) | Comisión |
|---|---|---|---|
| USD-ARS / ARS-USD sin int. | mr en monR, me en monE (TC del acuerdo) | ingreso C→P monR mr; egreso P→C monE me | Implícita en la cotización (`comisiones_orden` en 0) |
| USD-ARS / ARS-USD con int. | Igual | **cp_ic**: C→P + I→C · **ci_pc**: C→I + P→C | Ídem; tasa por transferencia al intermediario solo en CC intermediario |
| USD-USD con int. | Ambos USD; **mr − me = comisión total** (Pandy + intermediario) | cp_ic / ci_pc, 2 transacciones | `comisiones_orden` (fija 50/75 en cp_ic, configurable); el spread va como fila sintética "Comisión del acuerdo" sin `transaccion_id` |
| CHEQUE-ARS con int. | Ambos ARS: mr = cheque, me = efectivo | Tx1 ingreso C→P cheque mr; Tx2 egreso P→C me; Tx3 egreso P→I cheque mr; Tx4 ingreso I→P efectivo mr×(1−tasa) | Spread = comisiones Pandy + intermediario |
| EUR cruzados | Igual que USD-ARS | — | Inactivos (0 órdenes) |

**En prod la realidad difiere de la plantilla:** 919 de 962 órdenes vivas tienen multicontraparte manual. Firmas más comunes (con sentidos invertidos):

| Tipo | Firma | Órdenes |
|---|---|---|
| USD-ARS + int. | ingreso P→C + egreso I→C | 262 |
| USD-USD + int. | ingreso P→C + egreso I→C | 210 |
| USD-USD + int. | ingreso C→I + egreso C→P | 172 |
| ARS-USD | ingreso P→C + egreso C→P | 57 |
| CHEQUE-ARS | Tx2 egreso C→P y Tx4 ingreso P→I | 51 |

- Comisiones: en prod el spread coincide con `comisiones_orden` en las 408 USD-USD y las 55 CHEQUE-ARS; no hay transacciones "Ganancia del acuerdo" vivas.
- Split por ejecución parcial: ejecutar por menos crea una transacción pendiente por el resto; el total no supera el acuerdo.

## 3. El caso USD-USD (ejemplos reales)

**Orden 68** (mr 1.450, me 1.300, con intermediario, MC): T161 ingreso **Pandy→Cliente** 1.450 (Pandy cubre la pata del cliente); T162 egreso Intermediario→Cliente 1.300. La regla ingenua cuenta 2.750 como "entregado". CC cliente: +1.300 "Compromiso de Pago (Pandy cumple pata…)" y −1.300 "Préstamo al cliente…"; CC intermediario: −1.300 pago realizado y −24,998 comisión. Sin caja (todo transferencia).

**Orden 85** (mr 6.935, me 6.835): T197 ingreso Cliente→Intermediario 6.935; T198 egreso **Cliente→Pandy** 6.835 (el cliente deja la entrega a cuenta). La regla ingenua cuenta 13.770 como "recibido". CC cliente neto −6.835 = **saldo a favor del cliente**; CC intermediario +6.935 y −34,675 de comisión.

**Orden 100:** mismo patrón que la 85.

En las tres, `totalesInstrumentacion` da recibido = mr y entregado = me exactos. La comisión no infla nada (no hay transacción de comisión) y las patas puras Pandy↔Intermediario se excluyen.

## 4. Definición correcta (la que ya usa la app)

Se suman las transacciones **no anuladas** (incluye pendientes):
- **Recibido** = Σ ingresos (en monR); **Entregado** = Σ egresos (en monE).
- **Exceso** = recibido > mr + tolerancia **o** entregado > me + tolerancia (0,0005 USD/EUR; 0,01 ARS).
- Participan: sin MC, las transacciones con el cliente (y con el intermediario si aplica), excluyendo Pandy↔Intermediario (`transaccionParticipaTotalesAcuerdo`); con MC (no CHEQUE), todos los ingresos y egresos (volumen).
- **USD-USD:** solo por tipo, nunca por moneda ni por sentido. **CHEQUE-ARS:** sin modo volumen; excluir Tx3/Tx4.

**Controles actuales**

| Punto | ¿Valida exceso? | Qué pasa si se excede |
|---|---|---|
| `saveTransaccion` (modal) | **Sí** (`validarTotalesVsAcuerdo`) | Aviso y no guarda |
| `guardarSoloMontoTransaccion` (tabla) | **No** | Guarda y sincroniza |
| `cambiarEstadoTransaccion` | **No** | — |
| `calcularEstadoOrden` / aviso de falta o exceso | Solo informa | Orden "parcial / no conciliada" |
| Invariante de neteo | Indirecto | Sin MC: si no netea, no llama a la RPC (libro sin cambios) |
| Reglas con `monto_origen = mr/me` | Indirecto | Topean la CC al acuerdo sin aviso |
| RPC / triggers / CHECK en base | **No** | — |

## 5. Medición en prod (vivas)

| Tipo | Vivas | Excedidas (regla correcta) | Excedidas (regla ingenua) |
|---|---|---|---|
| USD-USD + int. | 408 | **0** | 383 |
| USD-ARS + int. | 270 | 0 | 0 |
| USD-ARS sin int. | 132 | 0 | 0 |
| ARS-USD (con y sin int.) | 97 | 0 | 0 |
| CHEQUE-ARS | 55 | **0** | 53 |

Las 962 están conciliadas exactas; ninguna transacción pendiente. **Un bloqueo con la regla correcta no afecta ninguna orden existente.**

## 6. Excepciones legítimas que la regla debe permitir

1. Redondeo (tolerancias actuales; 8 decimales en USD en cruces).
2. Patas invertidas y terceros en multicontraparte → cubiertas al sumar por tipo.
3. Comisiones: fuera de las transacciones del acuerdo (si apareciera una "Ganancia" C→P chica, excluirla con la heurística existente).
4. Tasa por transferencia y patas Pandy↔Intermediario: excluidas.
5. Compensación que excede la deuda (flip con confirmación): es un tope contra el saldo de CC, no contra el acuerdo; no mezclarlos.
6. Instrumentación "Aj" y multicontraparte: redistribuyen, pero deben cerrar igual al acuerdo.
7. **El cliente realmente pagó de más:** no es sobre-ejecución; se modela editando el acuerdo (mr/me), con un movimiento CC manual o con otra orden.

## 7. Recomendación

1. **Bloqueo duro en el front (todos los tipos):** llamar a `validarTotalesVsAcuerdo` en `guardarSoloMontoTransaccion` (antes del UPDATE), en `cambiarEstadoTransaccion` y en la cola offline, con las mismas opciones de MC que `saveTransaccion`; mensaje que sugiera "editá el acuerdo".
2. **Corregir los splits por ejecución parcial**, que hoy calculan el resto con la lógica ingenua (por pagador = cliente): deberían usar `totalesInstrumentacion`; con patas invertidas (USD-USD, CHEQUE) pueden no crear el resto o calcularlo mal.
3. **Guarda en base (segunda etapa):** validación en `transacciones` o al entrar a `sync_cc_caja_orden` (Σ por tipo, excluyendo Pandy↔Intermediario, contra mr/me). Arrancar como aviso + auditoría en Pandy-Dev y pasar a bloqueo tras una semana sin falsos positivos.
4. **No tocar** el invariante de neteo ni las reglas `mr/me`: son la red de seguridad contable; el problema es de validación de entrada.

**Riesgos y mitigaciones**
- Diferencias de lógica MC / no MC entre front y base → tests unitarios con las firmas reales de §2.
- Orden de edición (bajar una pata y subir otra): validar sobre el estado final o permitir edición en lote.
- Cola offline: rechazar con mensaje claro, no en silencio.
- Revisar CC cliente, CC intermediario y caja juntas.

## 8. Evidencia (main.js, al 20/11/2026)

`totalesInstrumentacion` y exclusión Pandy↔Intermediario: ~29351, 29389-29421 · modo volumen MC: ~11800 · `validarTotalesVsAcuerdo`: ~29483-29509 (solo usado en `saveTransaccion` ~33621) · `guardarSoloMontoTransaccion` sin validación: ~23015 · `cambiarEstadoTransaccion`: ~33152 · `calcularEstadoOrden`: ~29643 · invariante de neteo: ~16173 (exenciones cp_ic ~16229, ci_pc ~16249), bloqueo de RPC ~30708-30728 · `montoBaseReglaNegocio`: ~16363 · patrón cp_ic/ci_pc: ~13441 · plantillas: ~31034-31112 · comisión fija 50/75: ~2780 · split con lógica ingenua: ~34030-34046.

Docs: `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md` §3 y §6 · `docs/CORAZON_SISTEMA_CC_Y_CAJA.md` §1 y §3 · `docs/FLUJOS_CC_REGLA.md` §2.


## 9. Implementación (21/11/2026) y hallazgo en el motor CC

**Implementado (punto 1):** `pandiValidarAcuerdoTrasCambiosMonto` (mismo criterio que el modal, `totalesInstrumentacion` por tipo, multicontraparte activado leyendo `tipo_operacion_id`) en: edición de monto en la tabla (el campo vuelve al valor guardado si se rechaza), cambio de estado con monto sin guardar (sin bucle), editor por lotes y cierre de "Vista tabla" (validan el lote completo), cola offline (rechaza con mensaje). Solo bloquea si el exceso crece. Probado en Pandy-Dev por el agente tester.

**Punto 2 (resto por ejecución parcial) — EN ESPERA.** El cálculo por totales funciona (tester: ejecutar 600 de 1.000 crea un pendiente exacto de 400; con dos ingresos planificados no crea de más), pero **el motor de CC prorratea mal la CC en ARS cuando una orden USD-ARS sin multicontraparte tiene dos ingresos**: al ejecutar el egreso genera `cobro_realizado` −400.000 (solo el último ingreso × TC) y `compromiso_pago` +1.000.000 → **CC ARS +600.000** en vez de 0 (caja correcta). Ocurre también con dos ingresos cargados a mano, así que es preexistente. En prod hoy **no hay** órdenes sin multicontraparte con más de un ingreso, por eso no hay daño; pero activar el resto automático lo dispararía en cada pago parcial. Se mantiene el comportamiento vigente (la rama "momento cero" no crea el resto) hasta corregir el motor.

**Próxima tarea sugerida:** auditor CC + analista: revisar `monto_origen = mr_prorrateado` / armado de `cobro_realizado` del egreso con varios ingresos (`aplicarMotorCcDesdeReglasDeNegocio`, ~main.js:16840-16900) y las filas de `reglas_de_negocio` USD-ARS; corregir en reglas (Regla de ORO) y recién ahí activar el resto automático.


## 10. Corrección del motor CC — "dos ingresos" (21/11/2026)

**Causa raíz (auditor CC):** el monto se calculaba bien (`me_prorrateado` por transacción: −600.000 y −400.000), pero `ccTransaccionRefParaMovimientoMoneda` reasigna las filas cuya moneda no coincide con la de la transacción a la única transacción en esa moneda (el egreso). Las dos filas quedaban con la misma identidad de libro (transacción + moneda + familia + signo, sin monto) y en la RPC **la segunda pisaba a la primera** (en el historial de dev la fila oscilaba −400.000 ↔ −600.000 en cada sync). Con montos iguales (500+500) el dedupe del front descartaba una.

**Corrección (genérica, sin ramas por tipo):** `pandiCcSumarFilasReasignadas` en `aplicarMotorCcDesdeReglasDeNegocio` — las filas **reasignadas** a otra transacción que provienen de **transacciones de origen distintas** y comparten identidad se suman en una sola. Con una transacción por rol no cambia nada. Reglas de negocio sin cambios.

**Alcance:** cruces sin intermediario (USD-ARS, ARS-USD, EUR-*) con 2+ ingresos o 2+ egresos. No afecta USD-USD ni CHEQUE-ARS (una sola moneda, sin reasignación) ni multicontraparte (graba en la propia transacción).

**Impacto en prod:** 0 órdenes vivas con 2+ transacciones del mismo tipo/pagador/cobrador y 0 oscilaciones en el historial → **no cambia ninguna CC existente**.

**Pruebas (tester, Pandy-Dev):** 600+400, 500+500, dos egresos, control de una transacción, Refrescar ×2 sin cambios en historial, USD-USD con intermediario sin variación de saldos, 0 duplicados.

**Sigue pendiente (paso 2, requiere simulación y decisión):** reglas con `monto_origen` fijo `mr`/`me` por transacción (CHEQUE-ARS ingreso C→P, USD-USD pendiente, cruces con intermediario C→I) sumarían N×acuerdo si hay N transacciones del mismo rol. Hasta resolverlo, el **resto automático por ejecución parcial sigue desactivado** (comportamiento vigente). Además: las reglas **con intermediario** difieren entre Pandy y Pandy-Dev (hash distinto) — revisar paridad.
