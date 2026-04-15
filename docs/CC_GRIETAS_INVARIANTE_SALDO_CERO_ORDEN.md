# Grietas del sistema frente al invariante «orden cerrada → CC cliente–Pandy sin posición fantasma»

**Invariante acordado (ámbito):** Si para una orden el **cliente del acuerdo** y **Pandy** cumplieron **todo** lo pactado (instrumentación coherente con el acuerdo y transacciones en estado ejecutado donde corresponde), los **movimientos de CC atribuibles a esa orden** entre ese cliente y Pandy deben **netear a cero en cada moneda relevante** del canje (incluye cruces de dos monedas y, por la misma filosofía, USD–USD cuando el acuerdo quedó liquidado sin deuda explícita al cliente según el modelo de reglas).

**Fuera de alcance de este invariante:** la CC **Pandy–intermediario** puede ser distinta de cero (comisiones, lo que el intermediario cumplió por Pandy, etc.).

Lista **dónde** el sistema puede violar el invariante o dificultar su verificación. Incluye **mitigaciones ya implementadas en `main.js`** (avisos al operador) y lo que sigue abierto (MC manual, validación dura al guardar, etc.).

**Referencias técnicas:** `sincronizarCcYCajaDesdeOrden`, `aplicarMotorCcDesdeReglasDeNegocio`, `lookupReglasDeNegocio`, `contrapartidaEjecutada` en `main.js`; `docs/CC_OPERACION_CIERRE_Y_PIPELINE_SYNC.md`, `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/REGLAS_DE_NEGOCIO.md`.

---

## 1. Tres vías de construcción de CC por orden (no equivalentes)

| Vía | Condición aproximada | Efecto en el invariante |
|-----|----------------------|-------------------------|
| **A. Motor `reglas_de_negocio`** | Hay filas para `(codigo_tipo, usa_intermediario)` y **no** está activo multicontraparte manual en sync. | La verdad contable sale de la matriz + `contrapartidaEjecutada`. Si la matriz o el match fallan, el invariante se rompe **sin** que el cierre sintético legacy lo compense. |
| **B. Legacy + cierre sintético dos monedas** | **No** hay filas en `reglas_de_negocio` para ese tipo/int., **no** es multicontraparte manual, y `moneda_recibida !== moneda_entregada`. | Se suman ingresos/egresos ejecutados cliente↔Pandy o cliente↔intermediario y se insertan dos líneas de cierre (+m en monR, −m en monE). **No** corre si el motor está activo (evitar duplicado). **No** aplica si ambas monedas son iguales (p. ej. mismo código de moneda en acuerdo de una sola moneda aparente). |
| **C. Multicontraparte manual** | `instrumentacion.multicontraparte_manual` → `aplicarCcMulticontraparteManualConciliacionCompleta`; el motor corre **solo** en `soloComisiones` (comisiones/tasas sintéticas, sin recorrer trx). | La CC por transacción la arma MC. **Excepción al neteo cero en monR:** filas con leyenda **Pandy** o **Tercero** «cumple pata» en el concepto. Resto netea con −m/+m donde aplica (`INSTRUMENTACION_MANUAL_MULTICONTRAPARTE` §3). **Antes de persistir**, `validarInvarianteNeteoCcClienteAcuerdoCerrado` bloquea `sync_cc_caja_orden` si la suma por moneda no cierra (salvo residual monR = suma de esas leyendas). En **USD-USD** con `soloComisiones` **no** se duplica en cliente la fila implícita `mr−me` (rompe el neteo; el spread ya está en las patas MC). |

**Grieta:** el mismo usuario puede creer que «orden ejecutada = cero CC cliente» en todos los modos; solo el **modo A con matriz completa y trx alineadas** está diseñado para alinearse con la regla de oro tabular.

---

## 2. Motor: transacciones sin regla matcheada

En `aplicarMotorCcDesdeReglasDeNegocio`, para cada transacción se hace `lookupReglasDeNegocio(...)` con `(tipo_operacion_codigo, pagador, cobrador, tipo, es_comision, estado, contrapartida)`.

- Si **`reglasTx.length === 0`**, la función **sale de esa transacción sin emitir movimiento**.
- **Mitigación:** si tampoco hay fila con `es_comision = true` para la misma clave, y la transacción es ingreso/egreso no anulada (excluye duplicado comisión Pandy ya contemplado en el motor), se acumula un aviso. Tras armar las filas CC, **`showToast` + `console.warn`** (salvo sync global encadenado, ver abajo).
- Causas típicas: instrumentación con **pagador/cobrador** que no coinciden con los strings de la tabla; tipo de operación distinto al de `getReglasDeNegocio`; filas faltantes en Supabase respecto del repo canónico.

**Grieta residual:** la CC puede seguir incompleta hasta corregir datos o reglas; el aviso evita el fallo **silencioso**.

---

## 3. Motor: exclusiones y `continue` dentro del bucle por regla

Además del «sin match», el motor **omite** movimientos en casos explícitos, entre otros:

- **Ingreso cliente→Pandy** con monto ≈ comisión Pandy y claramente menor que `mr` (evitar duplicar con la lógica de comisión/spread en USD-USD y repartos).
- **Egreso ejecutado sin contrapartida** en CC cliente, moneda USD en USD-ARS o ARS en ARS-USD con `monto_origen` `mr_prorrateado` (evitar duplicar la pata equivalente mientras el ingreso sigue pendiente).
- **Patrón `ci_pc` con intermediario en USD-USD:** el egreso **Pandy→Cliente** **no** se refleja en CC intermediario (`continue` en rama intermediario) por diseño documentado en comentarios del código; la CC **cliente** sigue dependiendo de las filas correctas para cliente.

**Grieta:** si las reglas o el estado/contrapartida no están alineados con esas ramas, puede faltar una pata o quedar asimetría. Requiere que la **matriz** y los **estados** reflejen el mismo guion operativo.

---

## 4. Comisión implícita USD–USD (`mr_menos_me`, `es_comision`)

El cierre «sin deuda al cliente» en USD–USD con spread depende de filas dedicadas en `reglas_de_negocio` y de condiciones de **par cliente** (ingreso cobro ejecutado + egreso entrega ejecutado) y lookups alternativos (C→I vs C→P) para la regla de comisión.

**Grieta:** si falta la fila, el estado no es el esperado, o `mr/me` no coinciden con la instrumentación, el saldo puede no ser cero aunque la orden figure cerrada en UI.

---

## 5. `contrapartidaEjecutada` y grafo fijo

`contrapartidaEjecutada` implementa un **grafo fijo** de pares de transacciones (cliente/pandy/intermediario). No conoce escenarios fuera de ese modelo (tercer cliente como contraparte, multicontraparte libre con libros distintos, etc.).

**Grieta:** una trx «ejecutada» con `contrapartida` calculada en falso o en true incorrectamente cambia qué filas de la tabla aplican → una sola pata en una moneda o doble conteo conceptual en la matriz.

---

## 6. CHEQUE-ARS + intermediario sin motor

Si por algún motivo **no** hay filas en `reglas_de_negocio` para ese tipo+int., entra la rama **fallback** específica (comisiones sintéticas, condiciones `parClienteCerradoFb`, etc.) y el bucle legacy por transacciones con `incluirEnMovimientosCcClienteModelo` / `incluirEnMovimientosCcIntermediarioModelo`.

**Grieta:** doble fuente de verdad (tabla vs ramas legacy); desalineación entre lo desplegado en Supabase y el código esperado.

---

## 7. `getReglasDeNegocio` vacío u orden mal tipada

- **`tipo_operacion_id` ausente o código desconocido** → `getReglasDeNegocio` puede devolver `[]` → **no** hay motor → vía B o CHEQUE fallback.
- **`usaIntermediario` para el fetch:** se deriva de `tipos_operacion.usa_intermediario` **o** `orden.intermediario_id`. Un desajuste catálogo vs orden real puede traer el conjunto de reglas equivocado.

**Grieta:** reglas “con int” vs “sin int” incorrectas → lookups vacíos o filas que no aplican al flujo real.

---

## 8. Reglas auxiliares en cruces con comisión intermediario (TC)

Para algunos códigos y cruces, se **concatenan** reglas de tipos auxiliares (`necesitaReglasAuxComInt`, p. ej. ARS-USD con int. en escenarios no canónicos EUR). Un cruce nuevo o mal clasificado puede **no** entrar en esa lógica y quedarse solo con `reglasBase` incompletas.

**Grieta:** matriz incompleta para combinaciones de moneda/código/int. no contempladas en el merge.

---

## 9. Multicontraparte manual (MC)

Con MC activo, la CC se arma solo con `aplicarCcMulticontraparteManualConciliacionCompleta`. No pasa por el motor ni por el cierre sintético legacy de dos monedas de la misma forma.

**Grieta:** el producto acepta explícitamente que el detalle CC puede diferir del modelo canónico; **no** usar el invariante «cero por orden» como garantía universal sin definir reglas específicas para MC.

---

## 10. Persistencia: RPC y fallback

`sync_cc_caja_orden` **persiste** el JSON que arma el front; **no** recalcula ni valida el invariante en servidor. Si el front construye filas inconsistentes, la base las guarda.

Si falla la RPC, **`fallbackSyncCcCaja`** intenta el mismo conjunto por otra vía; tampoco valida invariantes.

**Grieta:** no hay “última línea de defensa” en PostgreSQL para el cero por orden.

---

## 11. Deduplicación de filas antes del RPC

Antes de llamar a la RPC se filtran duplicados con una clave compuesta (cliente/orden/transacción/moneda/monto/prefijo de concepto). Dos líneas **legítimas** que colisionen en esa clave podrían colapsarse (riesgo bajo, pero existe).

**Grieta:** pérdida silenciosa de una línea → saldo incorrecto.

---

## 12. Movimientos CC manuales con `orden_id`

La sync **borra** todos los movimientos CC de la orden y reinserta solo los derivados del pipeline. Cualquier movimiento manual histórico vinculado a esa `orden_id` **no sobrevive** al resync (si el producto permitiera crear tales filas).

**Grieta:** mezclar “ajustes manuales por orden” con el modelo derivado-only sin política explícita.

---

## 13. Estado de orden vs estado de transacciones

El invariante habla de **acuerdo cumplido**. Si la UI marca la orden como ejecutada pero alguna transacción relevante sigue pendiente o hay instrumentación inconsistente, el sistema puede ser “coherente consigo mismo” pero **no** con la expectativa del usuario.

**Grieta:** definición de “cerrada” en pantalla vs conjunto de trx en `ejecutada` y contrapartidas.

---

## 14. Cola offline y bifurcaciones

Cualquier divergencia entre lo que hace la cola offline y `sincronizarCcYCajaDesdeOrden` en línea (mismos datos, distinto orden de aplicación) puede dejar CC desalineada hasta el próximo resync global.

**Grieta:** hay que mantener paridad explícita entre caminos; no asumir un solo ejecutor.

---

## 15. Drift DB vs repo

Los scripts en `sql/` son la fuente de verdad **esperada**; Supabase puede quedar atrás o con migraciones parciales.

**Grieta:** el código asume filas que no existen en prod → motor vacío o incompleto.

---

## Mitigaciones implementadas (`main.js`)

| Qué | Cómo |
|-----|------|
| Trx sin regla (`es_comision` false **y** true) | Array `motorCcWarnings` en `aplicarMotorCcDesdeReglasDeNegocio`; toast orden + detalle en consola. |
| Par cliente cerrado / MC toda ejecutada pero CC no netea | `validarInvarianteNeteoCcClienteAcuerdoCerrado` antes de `sync_cc_caja_orden`; **no** persiste si falla (consola siempre; toast si no `silenciarAvisosInvarianteCc`). Excepción monR: suma de filas con leyenda Pandy o Tercero «cumple pata». **Cuándo corre:** solo si **no hay transacciones pendientes** (todas ejecutada o anulada, ≥1 ejecutada) **y** (MC completo **o** sin MC con par clásico C→P/I + entrega ejecutados **o** orden en `orden_ejecutada` / `instrumentacion_cerrada_ejecucion`). No se dispara a mitad de instrumentación aunque ya existan un ingreso cobro y un egreso entrega ejecutados (p. ej. CHEQUE 4 patas o MC parcial). |
| Sync global (muchas ódenes) | `sincronizarCcYCajaDesdeOrden(ordenId, { silenciarAvisosInvarianteCc: true })` — sin toasts duplicados; el bloqueo por neteo **sí** evita la RPC por orden afectada. |

Helpers: `motorCcTransaccionEsperaReglaEnTabla`, `sumaCcClienteCerradoPorMonedaDesdeFilas`, constante `EPS_CC_NETEO_CLIENTE_ORDEN`.

**Lookup y roles:** el motor aplica `transaccionNormalizarPagCobVacios` y `pagCobEfectivosTransaccionSync` sobre cada transacción antes de `lookupReglasDeNegocio`, alineado al sync de CC. Si `pagador`/`cobrador` en BD vienen vacíos o null, no se usa solo el valor crudo (que impediría matchear filas con `cliente` / `pandy` / `intermediario`).

---

## Pendiente / endurecimiento futuro

1. **Validación dura al guardar** instrumentación: pagador/cobrador deben matchear al menos una clave prevista para el tipo (bloquear guardado con mensaje).
2. **Tests E2E** o fixtures que afirmen neteo en escenarios canónicos (acuerdo previo para expectativas).
3. **Pata monR:** leyendas «Pandy cumple pata» / «Tercero cumple pata» — `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md` §3 y motor en `aplicarMotorCcDesdeReglasDeNegocio`.
4. **Procedimiento operativo:** tras cambiar `sql/` canónico, aplicar en Supabase + resync de órdenes afectadas.

Cualquier **test E2E** o cambio de expectativas numéricas debe seguir la regla del proyecto: **acuerdo previo** con el negocio antes de mover aserciones.
