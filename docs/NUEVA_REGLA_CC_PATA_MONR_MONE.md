# Nueva regla — CC patas MonR (ingreso) y MonE (egreso)

**Estado (2026-04-21, actualizado 2026-04-22):** **Fase 0 (producto)** cerrada en este documento (MonE §1.2, MonR §1.3, CC intermediario §1.1.1, rollout §1.3.3, cierre inventario §4.4). **Fase 1** y **Fase 2** implementadas en el repositorio; el **IN de exclusión del rollout** pasó de **8** (§4.4) a **15** números al sumar **14, 22, 44, 52, 69, 70, 71** (post-deploy prod, **§1.3.3**). **QA manual en dev** §7.5 exitoso. **§8.1** cerrada en repo. **§4.5–§4.7** documentados. **§8.2:** las excluidas **no** reciben motor nuevo hasta decisión explícita; **§8.3** aclaración SQL sin pendiente de código. **§8.4:** despliegues según bitácora; tras ampliar el IN conviene **re-sincronizar** las órdenes afectadas en prod para regenerar CC en **legacy**. **Post-deploy prod y re-sync (2026-04-22):** verificación MCP y lección operativa **§8.5** (leyendas persistidas, diff, **re-sync no restaura histórico** ni aísla solo el IN frente a signos compartidos).

**Imagen de referencia (captura angosta):** `assets/image-7e7970e1-d3b7-4d49-b8b4-dc99accb4f3b.png`.

---

## Texto literal acordado (chat de este hilo)

La regla esta solo aplica si se dan las siguientes condiciones.

**Pata de ingreso** =  Pandy - Cliente del acuerdo explicito - consistente con Regla B - MonR

**Pata de egreso** puede ser

- Pandy - Cliente del acuerdo explicito - MonE  
- Intermediario -Cliente del acurdo explicito - MonE  

Simplificando si se dan estas condiciones , saquemos prestamos y todo eso que lo hace complejo ya que el proposito es justamente afectar la cuenta corriente con el cliente.

El sistema en cuenta corriente tiene que generar ni bien se termina de detectar este patron los 3 movimientos

- Pata ingreso con signo + por el valor de MonR  
- Pata egreso con +/- neteando la pata de MonE  

Si tiene intermediario y hay comision implisita en la cuenta corriente con el intermediario debe registrar igual que ahora 2 movimientos la moneda entregada signo - y el de la comision signo +

**Esa es la regla completa.**

> **Corrección de producto (posterior al chat):** con intermediario y nueva regla en rollout, en **CC intermediario** los dos movimientos van en **negativo** (MonE **y** comisión): Pandi **debe** al intermediario la entrega cumplida más la comisión del intermediario (**§1.1.1**). El bullet del chat arriba queda **superseded** para signos en CC intermediario.

**Alcance** todo tipo de operacion que cumpla con esas condiciones . Unica exceptuada Cheque-ARS.

**Tareas acordadas para el asistente**

1. Recorrer todo el codigo para ver los impactos.  
2. Ver con el MCP que ordenes en produccion se pueden ver afectadas. Afectadas es que con el cambio les termine afectando el saldo actual en la cuenta corriente , sea del intermediario o del cliente.  
3. Recorda que todo lo ya hecho hoy no esta en produccion con lo cual , compara el codigo de produccion con el supuesto nuevo codigo.

**SI tenes preguntas, que sean bien concretas y las repasamos.**

---

## 1. Alcance operativo y universo para evaluación **exacta**

- **Universo SQL (evaluación exacta):** el patrón **amplio** de `inventario_patron_cc_regla_b_candidatas.sql` — mismos criterios MonR/MonE que arriba — **excluyendo órdenes con `ordenes.estado = 'anulada'`** (no elegibles). En **Pandy prod** (2026-04-17) eso deja **16** órdenes; si se incluyeran anuladas serían **26** (**10** anuladas en ese patrón, p. ej. la **12**). Incluye **orden 68**.  
  En el hilo se corrigió en **código** la persistencia de UUID donde faltaba para **nuevas** escrituras; las órdenes ya guardadas sin UUID en egreso **siguen** en el amplio hasta re-sync/backfill: la evaluación de impacto usa el amplio **sin anuladas**, no el subconjunto estricto UUID-only.
- **No** se excluye **multicontraparte manual** ni **edición manual** de la instrumentación.
- **CHEQUE-ARS** es la **única** exclusión explícita de tipo de operación.

### 1.1 Signos, leyendas y libros (definición cerrada — chat)

| Dónde | Qué exige la regla |
|--------|---------------------|
| **CC cliente — MonR** | **Ingreso** en **moneda recibida**: en lo normal el cliente **entrega** a la empresa; **en esta regla** Pandi **asume el compromiso del cliente** en esa pata y refleja el juego de saldos en CC. **Leyenda fija** (solo MonR): **§1.3.4**. Por cada trx ingreso que cumpla el patrón: reflejo **positivo** en CC del cliente por **ese monto** (**§1.3.1**). |
| **CC cliente — MonE** | **Egreso** / **entrega al cliente** (Pandy o intermediario → cliente del acuerdo en **moneda entregada**): pata que **netea** MonE; plantillas de concepto **Compromiso / Pago hacia el cliente** (**§1.2.1**). Anclas de neto **§1.2** (§2 / §4.3). |
| **CC intermediario** | Con **intermediario** en la operación, la **pata MonE** (entrega al cliente) **no** la asume también Pandy en el modelo de esta regla: en **CC intermediario** van la **pata MonE** en **negativo** y la **comisión del acuerdo** también en **negativo** — refleja que **Pandi le debe al intermediario** lo que este cumplió en la entrega **más** la parte de comisión del intermediario. Detalle **§1.1.1**. |

#### 1.1.1 CC intermediario (producto corregido)

**Condición:** orden **con intermediario** y alcance de la **nueva regla CC** MonR/MonE (rollout **§1.3.3**).

**Signos en CC intermediario**

- **Pata MonE** (entrega al cliente, vinculada a la instrumentación que corresponda): **negativa**.
- **Comisión del acuerdo** (línea sintética desde `comisiones_orden` / motor): **negativa**.

No se discrimina por **cp_ic** / **ci_pc** para estos signos: la convención unificada es **−MonE** y **−comisión** en el libro del intermediario bajo esta regla.

Además, la **comisión** generada por el motor con **tasa sobre transferencia al intermediario** (campos de orden) debe ir en **−** en CC intermediario aunque la orden **no** califique el patrón amplio MonR/MonE (rollout).

Implementación: comisión en `aplicarMotorCcDesdeReglasDeNegocio` (USD-USD / cruces TC); MonE en intermediario en multicontraparte manual `aplicarCcMulticontraparteManualTrx` (pagador intermediario, `pago_realizado`). **Fuera de rollout MonR/MonE:** la fila sintética de comisión intermediario **no** tiene un solo criterio global de signo: el motor bifurca por **`patronInstrumentacionIntDesdeTransacciones`** (**ci_pc** vs **cp_ic** y resto). En **ci_pc**, el monto respeta **`reglas_de_negocio.signo`** (típicamente **−**, alineado a CHEQUE-ARS y a la matriz). En **cp_ic**, se conserva la convención histórica: **`Math.abs(signo × base)`** y **−** solo si rollout o **tasa por transferencia al intermediario** activa (`intermediario_pago_transferencia` + `intermediario_transferencia_cobra_tasa` y tasa > 0); si no, **+** por magnitud (p. ej. órdenes prod **8, 41, 58, 67, 68, 81**). Ver **`docs/CC_FIX_COMISION_INTERMEDIARIO_USD_USD_CI_PC.md`**.

### 1.2 Fase 0 — Cierre producto: **CC cliente — MonE** (sin código)

Objetivo: fijar qué debe cumplir el libro **CC del cliente del acuerdo** para la **pata MonE** cuando ya se detectó el patrón (condiciones del chat y universo **patrón amplio** §1), de modo que implementación futura y la heurística **§2 / §4.3** midan **el mismo** neto.

**Alcance y exclusiones (sin cambiar lo ya acordado)**

- **CHEQUE-ARS:** fuera del patrón (única exclusión explícita de tipo).
- **Multicontraparte manual** e **instrumentación ajustada manual:** **dentro** del alcance operativo de la orden; las anclas de neto MonE deben cumplirse en movimientos **derivados** enlazados a las trx MonE del patrón. La **nueva regla ignora por completo** las filas CC **`es_movimiento_manual`** (definición owner **§1.3.2**): no entran en detección ni en el cómputo del neto esperado de la regla (alineado a excluir manuales en SQL de diff).
- **CC intermediario:** con intermediario y nueva regla en rollout, **§1.1.1** (−MonE y −comisión); no entra en el neto «MonE cliente» del §2.

**Lectura de los «tres movimientos» del chat**

En el texto literal, el sistema genera **tres** impactos contables en el modelo mínimo: **(1)** pata MonR en CC cliente **(+)**; **(2)** pata MonE en CC cliente **neteada** con convención **+/−**; **(3)** si hay intermediario y comisión implícita, **dos** líneas en **CC intermediario** (pata MonE y comisión), con la convención corregida de **§1.1.1** cuando aplica la nueva regla con intermediario.  
Los puntos **(1)** y **(2)** viven en **CC cliente**; el **(3)** solo en **CC intermediario**. No se exige que MonE se dibuje en **una** fila física: puede ser **una** fila cuyo monto ya sea el neto, o **varias** filas enlazadas a la(s) trx MonE (p. ej. par **Pago realizado / Ajuste libro acuerdo** u otro par legacy) **siempre que** el resultado sea el neto acordado abajo.

**Qué trx cuentan como «MonE del patrón»**

Misma noción que el SQL de inventario / diff (`tx_eg_mone` en `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`): egresos en **moneda entregada** de la orden, **cobrador = cliente**, **cobrador del acuerdo explícito** (UUID del acuerdo o hueco amplio con **pagador** Pandy o Intermediario según ese SQL), **pagador** Pandy o Intermediario, estados **pendiente** o **ejecutada** (no anuladas).

#### 1.2.1 Plantillas de concepto (owner) — **egreso** / entrega al cliente (MonE)

Lo que vos describís como **movimiento de egreso** —lo que **la empresa o el intermediario entrega al cliente**— se documenta aquí como **pata MonE** (moneda **entregada**). **No** es la pata **MonR** (ingreso / moneda **recibida**); la leyenda fija de empresa (**§1.3.4**) va **solo** en MonR.

La regla exige que lo **único** que cambie entre trx **pendiente** y **ejecutada** sea el estado de la fila CC alineado a la trx y la palabra **pendiente** / **ejecutado** en el concepto:

| Rol del movimiento | Texto del concepto (plantilla) | Signo del `monto` |
|--------------------|--------------------------------|-------------------|
| Compromiso | `Compromiso de pago hacia el cliente - pendiente` **o** `Compromiso de pago hacia el cliente - ejecutado` | **Negativo** |
| Pago | `Pago hacia el cliente - pendiente` **o** `Pago hacia el cliente - ejecutado` | **Positivo** |

**Ancla de neto en CC cliente para todas las filas enlazadas a esas trx MonE**

| Situación en instrumentación (egreso MonE del patrón) | Suma algebraica objetivo en **CC cliente** de las filas **no manuales** con `transaccion_id` en cualquier trx **MonE** del patrón (misma moneda MonE) |
|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Algún** egreso MonE tiene **pagador = intermediario** | **0** (par **−/+** o equivalente que **netea** en el acuerdo; coincide con ancla §2 «mone_regla_cli = 0»). |
| **Ningún** egreso MonE con pagador intermediario (p. ej. solo **Pandy → cliente** en MonE) | **− suma(monto)** de todos los egresos MonE del patrón (coincide con ancla §2 cuando no hay pagador intermediario). |

**Tolerancia y verificación:** misma escala que **§2** / SQL: **0,02** por moneda al comparar neto persistido vs ancla.

**Signos en términos de negocio (MonE cliente)**

- Caso **ancla 0** (pagador intermediario en alguna trx MonE): el cliente del acuerdo no debe quedar con saldo residual por esa pata en MonE una vez sumadas las líneas enlazadas; el «neteo» del chat es **cero neto** en CC cliente para ese conjunto.
- Caso **ancla −suma(monto)**: el neto del acuerdo en MonE debe coincidir con el escalar **`mone_regla_cli`** del SQL de diff (implementación: reproducir ese número; no redefinir aquí la convención de signo fila a fila).

**MonR en la misma orden**

- Cerrado en **§1.3** (ingreso, leyenda fija empresa, manuales ignorados, rollout). Sin **préstamo gemelo** en este patrón (texto literal del chat y §5 del doc).

**Queda explícitamente para fases posteriores (no Fase 0 MonE)**

- Orden de emisión respecto del motor actual, dedupe y **invariante** de neteo por orden.
- **Plan de sync** masivo para las órdenes del cierre **§4.4**.

### 1.3 Definición de producto acordada (owner) — **MonR** (ingreso), manuales y rollout

Texto sintetizado a partir de definiciones explícitas del dueño de producto; prevalece sobre la redacción genérica del chat si hubiera tensión.

**Separación explícita (corrección de interpretación previa):**  
- **MonR** = **ingreso**, **moneda recibida**: lo que en lo habitual **entrega el cliente** a la empresa; **en esta regla** la empresa **asume ese compromiso** y refleja el juego en CC. Aquí va **únicamente** la **leyenda fija** **§1.3.4**.  
- **MonE** = **egreso**, **moneda entregada**: lo que **Pandi o el intermediario entrega al cliente**; las plantillas **«Compromiso de pago hacia el cliente» / «Pago hacia el cliente»** (**§1.2.1**) son de **esta** pata (egreso), **no** de MonR.

**1.3.1 — Alcance conceptual MonR (cada trx ingreso que califica)**  
Si se cumple la condición (**pagador del ingreso = Pandy**, **cliente** = el de la orden en el acuerdo explícito, **más** el resto de condiciones del patrón MonR), **no importa** cuántos otros movimientos existan en la CC del cliente: **por cada** transacción de ingreso que cumpla eso, en CC cliente el reflejo del **valor de esa trx** es **positivo** y **por ese monto** (en la **moneda recibida** / pata MonR). La forma concreta de **concepto** de esa fila (más allá de la leyenda obligatoria **§1.3.4**) la define implementación alineada al catálogo vigente de textos CC, **sin** reutilizar las plantillas de **§1.2.1** (esas son solo egreso MonE).

**1.3.2 — Movimientos manuales**  
La nueva regla **ignora por completo** los movimientos CC marcados como manuales (`es_movimiento_manual`): no participan en la lógica de detección ni en los netos/atribución de la regla.

**1.3.3 — Rollout (IN controlado)**  
El nuevo motor de esta regla **solo** corre en órdenes donde **no** se espera (heurística §4.3–**§4.4**) que el cambio **afecte el saldo** CC cliente frente al modelo mínimo actual, **salvo** ampliaciones explícitas del IN por decisión de producto. En implementación se **excluyen** por **`ordenes.numero`**:

- **§4.4 (2026-04-17):** **8** órdenes inventariadas como afectadas al saldo bajo diff: **17, 45, 57, 64, 68, 81, 87, 91**.  
- **Post-deploy producción (2026-04-22):** **7** órdenes que habían tomado el motor nuevo y se excluyen para volver a **legacy** al re-sincronizar: **14, 22, 44, 52, 69, 70, 71** (convivencia de lotes en **14**; resto alineado a revertir criterio hasta revisión).

**IN canónico (15 números):** **14, 17, 22, 44, 45, 52, 57, 64, 68, 69, 70, 71, 81, 87, 91**. El **resto** de órdenes que entren al patrón amplio pueden usar la nueva regla; las excluidas quedan en **legacy** hasta revisión caso a caso.  
Constante y función canónicas: `utils/cc-patron-nueva-regla-monr-mone.mjs` (`NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4`, `nuevaReglaCcRolloutActivoParaOrden`). Si `ordenes.numero` es **ausente** o no numérico, el rollout **no** activa el motor nuevo (no se asume «no excluida»).

**1.3.4 — Leyenda fija (solo pata MonR ingreso)**  
Refleja que **Pandi (la empresa) asume el compromiso del cliente en la moneda recibida** (pata ingreso MonR). **No** aplica a la pata **MonE** ni a las plantillas **§1.2.1**. Texto obligatorio:

`La empresa asume el compromiso de pago del cliente ( Afecta CC Cliente ).`

**Ubicación:** en **cada** movimiento CC de cliente que materialice la pata **MonR** según **§1.3.1** (p. ej. como sufijo al `concepto` de la fila **+monto** enlazada a esa trx ingreso), de modo que en listados quede explícito que es **ingreso** asumido por la empresa, **no** la entrega al cliente (MonE).

### 1.4 Avance plan — **Fase 1** (detector, sin motor aún)

- **Módulo:** `utils/cc-patron-nueva-regla-monr-mone.mjs` — exporta `esPatronAmplioCcMonrMoneNuevaRegla(orden, transacciones)` (patrón amplio coherente con `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`, roles vía `pagCobEfectivosTransaccionSync` como en `main.js`).
- **Tests:** `tests/unit/cc-patron-nueva-regla-monr-mone.test.mjs`.
- **Comando:** `npm run test:unit-cc-patron-nueva-regla`.
- **Fase 2 (implementado en `main.js`):** import de `nuevaReglaCcRolloutActivoParaOrden`; emisión MonR (leyenda §1.3.4, monto pleno por trx, sin préstamo gemelo vía `completarCcClientePrestamoReglaBPandyMonSiFalta`); MonE con plantillas §1.2.1 en multicontraparte manual, `ManualTrx` (Inter→Cliente) y atajo motor cruces sin int.; `debeOmitirParCcEgresoIntermediarioClienteAcuerdoPorReglaBPendientePandyMonR` con monto pleno si rollout; exenciones neteo / dedupe / compensación USD-USD alineadas a las nuevas subcadenas. **Listado exhaustivo de entregables y archivos:** **sección 7**.

---

## 2. «Afectada» = diff MonR y diff MonE (criterio pedido)

Para **CC cliente** en producción vs lo que la regla **metería** en cada pata (contribución al saldo por esa pata, enlazada a las trx MonR / MonE del patrón):

- **MonR:** la heurística del SQL de diff compara el **neto** hoy de movimientos CC cliente enlazados a trx ingreso MonR del patrón contra **`+ suma(monto)`** de esas trx. Con la pata MonR definida en **§1.3** (ingreso, **+monto** por trx + leyenda **§1.3.4**, **sin** el par Compromiso/Pago de **§1.2.1** que es **MonE**), puede hacer falta **revisar** el SQL de inventario cuando exista la nueva emisión. **Mientras tanto** (inventario §4.3 ya corrido en 2026-04-17), el criterio **histórico** del listado fue:
  - **Cruce de divisas** (`moneda_recibida` ≠ `moneda_entregada`, p. ej. USD→ARS): **solo magnitud** — afecta si **||neto| − suma(monto)| > 0,02**.
  - **Misma moneda** en recibida y entregada (p. ej. **USD-USD**): afecta si **|neto − suma(monto)| > 0,02** (p. ej. **68** con una sola línea +/− en legacy vs + en trx).
- **MonE (cliente):** comparar el **neto hoy** de movimientos CC cliente enlazados a las trx egreso MonE del patrón contra el ancla esperada en cliente: si **alguna** de esas trx tiene **pagador = intermediario**, el neto esperado enlazado a esa pata es **0** (par −/+ que netea); si no, **`− suma(monto)`** de egresos MonE. Si **|neto − ancla| > 0,02**, la pata **MonE** en cliente se considera **afectada**. *(La comisión implícita en CC intermediario se compara aparte; signos **§1.1.1**; no entra en esta resta cliente.)*

Implementación reproducible: `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` + MCP prod.

**Punto (3) código prod vs repo:** lo desplegado en **https://pandi.company** puede ir **delante o detrás** de `main` en Git; los movimientos en Supabase son los que persistió cada versión al sync. Para atribuir un diff a «código viejo en prod» hace falta el **SHA** del deploy y la fecha del último sync de la orden.

**Lectura del resultado 2026-04-17 (heurística actual del SQL §4.3):** **MonR** distingue cruce vs misma divisa (§2, criterio **histórico** antes de alinear el SQL al cierre **§1.3** MonR); **MonE** con ancla **0** si hay egreso con pagador intermediario; **sin órdenes anuladas**. Quedan **8** órdenes con diff en **alguna** pata (de **16** elegibles). La **22** sigue **fuera** (cruce USD→ARS, magnitud MonR OK y MonE neteado). La **68** entra por MonR en **USD-USD** (signo en CC vs trx).

---

## 3. Inventario SQL (estructura + saldos actuales en BD)

- `sql/inventario_patron_cc_regla_b_candidatas.sql` — patrón **amplio** (egreso MonE con UUID acuerdo **o** hueco histórico), **sin `ordenes.estado = 'anulada'`**. **Base para las 16 órdenes elegibles** en prod (2026-04-17).  
- `sql/inventario_patron_afecta_saldo_resync_heuristica.sql` — flags y netos CC **cliente** por trx MonR/MonE.

**Subconjunto estricto UUID en egreso:** solo **auditoría** de datos normalizados; la evaluación acordada usa el **amplio sin anuladas** (16 en prod al 2026-04-17).

---

## 4. Resultados MCP — Pandy **producción** (2026-04-17)

### 4.1 Patrón **amplio** (16 órdenes elegibles — sin anuladas)

Ingreso MonR con UUID cliente; egreso MonE con roles + OR UUID NULL. CC movimiento no anulado, no manual; por orden, **alguna** moneda con valor absoluto de neto > **0,02** en CC cliente / intermediario según fila.

| Métrica | Valor |
|--------|--------:|
| Órdenes en patrón amplio (excl. `anulada`) | **16** |
| Con neto CC **cliente** ≠ 0 (alguna moneda) | **16** |
| Con `intermediario_id` | **10** |
| Con neto CC **intermediario** ≠ 0 (si hay int.) | **10** |
| Incluye orden **68** | **sí** |

### 4.3 Diff MonR / MonE (CC cliente) — heurística vs prod (2026-04-17)

| Métrica | Valor |
|--------|--------:|
| Órdenes analizadas | **16** |
| Con diff **MonR** (cruce: solo magnitud; misma divisa: neto vs suma ingreso con signo; umbral 0,02) | **2** |
| Con diff **MonE** (neto vs ancla §2; umbral 0,02) | **7** |
| Con diff en **cualquiera** de las dos patas | **8** |

Números de orden afectadas por esta heurística: **17, 45, 57, 64, 68, 81, 87, 91**.

Ver §2: el diff sigue siendo **heurístico** sobre líneas enlazadas a `transaccion_id`; no reemplaza revisión caso a caso si hay líneas extra fuera de la pata o convenciones de signo distintas.

### 4.4 Cierre — saldo CC cliente bajo la nueva regla (verificado en app)

**Estado (2026-04-17):** inventario **cerrado**. Son **8** órdenes en las que, al implementar la regla de las tres líneas (§1) con los criterios de diff acordados (§2, §4.3), el **saldo de cuenta corriente del cliente** asociado a esas patas **dejaría de coincidir** con el modelo mínimo actual y por tanto se considera **afectado** para planificación de migración / re-sync.

| Campo | Valor |
|--------|--------|
| Órdenes (número) | **17, 45, 57, 64, 68, 81, 87, 91** |
| Criterio | `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` (patrón amplio sin `anulada`; trx solo **pendiente/ejecutada** y sin concepto «Ganancia del acuerdo» — §4.7; MonR cruce vs misma divisa; MonE con ancla intermediario §2) |
| Verificación | Revisión **caso por caso en la app** (los 8) — coincide con el listado SQL |

**Fuera de las 8** quedan las demás órdenes **elegibles** del patrón (p. ej. **22**: cruce USD→ARS con magnitud MonR alineada y MonE neteado) sin diff según esta heurística. La **comisión en CC intermediario** no entra en este conteo de cliente; el cierre de signos en int. es **§1.1.1** (no el texto literal + del chat).

### 4.5 Re-verificación MCP — Pandy prod (2026-04-21, solo lectura)

Se volvió a ejecutar en **producción** (MCP `execute_sql`, proyecto **Pandy** `bxwxuzbahewvptarlnxm`, **sin** `UPDATE`/`DELETE`/`INSERT`) el script `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`. Resultado: **16** órdenes en patrón, **2** con diff MonR, **7** con diff MonE, **8** con diff en al menos una pata, números **17, 45, 57, 64, 68, 81, 87, 91** — **misma foto** que §4.3–§4.4 (2026-04-17). No aparecieron órdenes nuevas ni cayeron fuera del listado en esta corrida.

### 4.6 Paridad **pandi.company** ↔ Git **`origin/main`** (commit desplegado)

**Para qué sirve:** cerrar el hueco “¿el inventario SQL y el motor que mirás en el IDE son el mismo universo que ve el usuario en prod?”. Si prod va **atrás** respecto al repo, la **población potencialmente afectada por código** (rollout, exclusiones, invariante) **no** coincide con lo que tenés en el working tree.

**Procedimiento reproducible (solo lectura, sin token Vercel):**

1. `git fetch origin main` y anotar `SHA=$(git rev-parse origin/main)`.
2. `curl -sS https://pandi.company/pandi-release.json` — el build publica ahí el blurb (ver `vite.config.js` / `pandi-release-blurb.js`).
3. Comparar `versionLabel` y el arreglo `lines` del JSON con `git show "$SHA":pandi-release-blurb.js` (`PANDI_RELEASE_BLURB`). Coincidencia ⇒ el **artefacto de release** corresponde a ese commit (misma versión de producto y mismas notas de despliegue).
4. Opcional: en el HTML de `https://pandi.company/`, el texto de `#sidebar-version` (versión en la cabecera) debe igualar `versionLabel`; cruzar con `git show "$SHA":index.html`.

**Con Vercel CLI** (sesión iniciada, p. ej. `vercel login` en la terminal del proyecto):

1. `vercel ls pandy --prod` — listar deployments **Production** del proyecto enlazado (`.vercel/project.json`).
2. Copiar la URL del deploy más reciente (p. ej. `https://pandy-gfi52m51r-lucas-bustos-projects.vercel.app`) **o** el id `dpl_…`.
3. `vercel api "/v13/deployments/<url-o-id>"` — en el JSON, leer `meta.githubCommitSha`, `meta.githubCommitRef`, `meta.githubCommitMessage`, `meta.gitDirty` (`"1"` = deploy desde working tree **sucio** respecto a ese SHA; el bundle puede no coincidir byte a byte con `git show <SHA>:…` para archivos tocados localmente al publicar), `source` (p. ej. `cli`), `meta.actor`.

**Verificación 2026-04-22 (Vercel + Git):** deployment **`dpl_GR1LpwADFe7evUKudYzHkR1su1nx`** (alias **pandi.company**): `meta.githubCommitSha` = **`570abbead3eea48dbb4d40c01a756928656a3bc3`**, ref **main**, mensaje **v3.7.66: CC movimientos toolbar…**, `gitDirty` = **1**, `source` = **cli**, `meta.actor` = **cursor-cli**. Coincide con **`git rev-parse origin/main`** y con **`pandi-release.json`** en vivo (§4.6 pasos 1–3). En ese snapshot, `main.js` **no** incluye `nuevaReglaCcRolloutActivoParaOrden` (motor nueva regla **no** en prod).

**“Nueva versión” (repo / working tree, 2026-04-22):** mismo **commit base** `570abbe` en `main`, pero **cambios locales no desplegados** (p. ej. `main.js` ~+1000 líneas vs `origin/main`, módulo `utils/cc-patron-nueva-regla-monr-mone.mjs`, tests y SQL en repo). Esa brecha **no** altera el inventario en BD hasta que existan **nuevos** movimientos o trx; sí define **quién** entrará al rollout cuando se publique el bundle nuevo.

**Implicación para §4.4–§4.5:** el conteo **16 / 8** en BD sigue siendo la referencia de **datos** bajo el motor **legacy** que hoy corre en prod. Al **desplegar** el motor nuevo, hay que **volver a** §4.5 (y, si cambió el detector o la heurística del SQL, reevaluar exclusiones).

### 4.7 Inventario SQL vs detector JS — ¿hay que ajustar el SQL?

El detector **`esPatronAmplioCcMonrMoneNuevaRegla`** (`utils/cc-patron-nueva-regla-monr-mone.mjs`) solo considera transacciones en estado **pendiente** o **ejecutada** y omite filas cuyo `concepto` contiene **«Ganancia del acuerdo»**. El inventario histórico §4.3 **no** filtraba por `transacciones.estado` ni por ese concepto.

**Ajuste aplicado en `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`:** mismos filtros en `ins`, `eg_amp`, `tx_ing_monr` y `tx_eg_mone`. **Qué sigue sin replicar en SQL** (riesgo residual menor): normalización **`pagCobEfectivosTransaccionSync`** con pagador/cobrador vacíos (el SQL usa columnas crudas como el inventario §4.3); exclusión **CHEQUE-ARS** en SQL por `tipos_operacion.codigo <> 'CHEQUE-ARS'` frente a heurística más amplia en JS (`esOrdenChequeArsDesdeOrdenPatron`).

**Re-ejecución MCP prod (2026-04-22) con el SQL ya alineado:** **16 / 2 / 7 / 8**, números **17, 45, 57, 64, 68, 81, 87, 91** — **sin cambio** respecto a §4.3–§4.5. Conclusión: **convivía** el desfase teórico SQL↔JS para el universo patrón actual en prod; **no** hace falta reclasificar la población §4.4 por este ajuste; **sí** conviene mantener el SQL alineado al detector para futuros datos.

### 4.2 Subconjunto estricto UUID en egreso (solo referencia)

| Métrica | Valor |
|--------|--------:|
| Órdenes | **9** |
| Con neto CC cliente ≠ 0 | **5** |
| Con neto CC intermediario ≠ 0 | **3** |
| Órdenes no anuladas (ejemplo listado previo) | 14, 22, 81, 87, 91 |

**Nota:** §4.1 resume totales de CC **actual**; §4.3–§4.4 son el **diff** y el **cierre** pedidos en §2 (solo cliente; heurística §2).

---

## 5. Evaluación de impacto en código (tabla del chat)

| Área | Qué hace hoy | Por qué importa para el cambio |
|------|----------------|----------------------------------|
| `montoPataRegulaBPandyMonRecibidaClienteCc` | Con misma moneda de catálogo y spread `mr > me`, usa `min(monto_trx, me)` en la pata MonR. | Si la nueva regla fija siempre **+ MonR** por un valor único de MonR, acá se redefine el núcleo numérico. |
| Multicontraparte / MC (`pushMcClienteRow` ~9694+) | Pata MonR con leyenda regla B; gemelo préstamo solo si `mcEmitirPrestamoGemeloReglaBPandyMonrUsdUsdConInter`. | Sustituir por esquema de 3 movimientos sin préstamo donde hoy hay gemelo. |
| `aplicarMotorCcDesdeReglasDeNegocio` (~12278+) | Ingreso MonR P→C con acuerdo explícito → fila regla B; cruces doble pata; resto por `reglas_de_negocio`. | Unificar emisión al detectar el patrón para todos los tipos elegibles; excluir CHEQUE-ARS. |
| `completarCcClientePrestamoReglaBPandyMonSiFalta` | Gemelo préstamo solo USD-USD + intermediario. | Cae o se reemplaza por el esquema sin préstamo. |
| Invariante / neteo | `sumaMovimientosPataMonRExentosNeteo`, préstamo gemelo, `validarInvarianteNeteoCcClienteAcuerdoCerrado`. | Reescribir exenciones / validador si las 3 líneas + comisión int cambian el residual. |
| Compensación CC | Anclas en `montoPataRegulaB…` | Re-sync y compensaciones deben usar el mismo núcleo MonR. |
| Tests | `tests/unit/compensacion-cc-flip-logica.test.mjs`, `tests/unit/cc-patron-nueva-regla-monr-mone.test.mjs`, E2E CC | Actualizar expectativas al cambiar motor. |
| SQL / docs | `reglas_de_negocio`, migraciones, `CUENTA_CORRIENTE_Y_CAJA.md`, grietas | Si el comportamiento documentado deja de coincidir con el motor. |

**Nota:** en BD **histórica** puede haber patas MonR con texto regla B y **monto** negativo (p. ej. orden 14). La regla nueva exige en **CC cliente** MonR **positivo** (§1.1): al comparar hoy vs futuro hay que mapear esas filas a la convención nueva o marcarlas para re-sync.

---

## 6. Recorrido de código (tarea 1) — anclas en `main.js`

Puntos de entrada y líneas aproximadas (revisar contexto en el archivo):

| Símbolo | Línea aprox. |
|---------|----------------|
| `pushMcClienteRow` | ~9694 |
| `montoPataRegulaBPandyMonRecibidaClienteCc` | ~10543 |
| `validarInvarianteNeteoCcClienteAcuerdoCerrado` | ~12104 |
| `aplicarMotorCcDesdeReglasDeNegocio` | ~12278 |
| `completarCcClientePrestamoReglaBPandyMonSiFalta` | ~11758 |
| Llamada invariante desde sync | ~24722 |

Búsquedas útiles en el repo: `sumaMovimientosPataMonRExentosNeteo`, `sumaMovimientosPataMonEExentosNeteo`, `compensacion_cc_monto_aplicado`, `filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx`, `reglas_de_negocio` (Supabase).

---

## 7. Registro de implementación (repo — consolidado 2026-04-21)

Esta sección resume **lo ya hecho en código/SQL/tests y pruebas manuales** alineado al plan MonR/MonE (no sustituye §1–§6 para definición ni inventario histórico MCP).

### 7.1 Detector, rollout y tests

| Entregable | Ubicación / notas |
|------------|-------------------|
| Patrón amplio MonR+MonE (no anulada, con `cliente_id`, no CHEQUE-ARS, ingreso Pandy→cliente acuerdo explícito en monR catálogo, egreso MonE hacia cliente con pagador Pandy o Inter y cobrador acuerdo / hueco amplio) | `utils/cc-patron-nueva-regla-monr-mone.mjs` — `esPatronAmplioCcMonrMoneNuevaRegla` |
| Lista fija de exclusión §4.4 y activación rollout | `NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4`, `ordenNumeroExcluidoRolloutNuevaReglaCc`, `nuevaReglaCcRolloutActivoParaOrden` (sin `numero` válido → **no** rollout) |
| Tests del módulo | `tests/unit/cc-patron-nueva-regla-monr-mone.test.mjs` — `npm run test:unit-cc-patron-nueva-regla` |
| Tests réplica invariante CC (MonR/MonE, compensación, offset I→C+comp, dedupe plano, guardas §1.3.4) | `tests/unit/cc-invariante-nueva-regla-neteo.test.mjs` — `npm run test:unit-cc-invariante-nueva-regla` (paridad con bloques ~11440, ~11659, ~11841, ~12222 en `main.js`) |

### 7.2 `main.js` — motor CC, multicontraparte y reglas B

- **Import** de `nuevaReglaCcRolloutActivoParaOrden` y uso en **MC** (`pushMcClienteRow` y ramas pendiente/ejecutada), **motor** (`aplicarMotorCcDesdeReglasDeNegocio`), **manual** (`aplicarCcMulticontraparteManualTrx` / conciliación), y puntos de **neteo / filtrado** donde hace falta distinguir rollout.
- **MonR en rollout:** `+monto` por trx ingreso calificada; sufijo de concepto con leyenda fija **§1.3.4** (`SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR` en código).
- **Sin préstamo gemelo** en el patrón nuevo: `mcEmitirPrestamoGemeloReglaBPandyMonrUsdUsdConInter` y `completarCcClientePrestamoReglaBPandyMonSiFalta` **no** aplican cuando el rollout de la nueva regla está activo para la orden.
- **MonE §1.2.1:** emisión alineada a Compromiso/Pago hacia el cliente en **MC** (incl. casos pendiente tratados como ejecutada donde correspondía), **ManualTrx** Inter→Cliente, y **atajo** del motor en cruces **sin** intermediario; extensión para **USD-USD + int.** (y análogos) cuando el atajo de cruces no cubría solo MonR.
- **`debeOmitirParCcEgresoIntermediarioClienteAcuerdoPorReglaBPendientePandyMonR`:** omite par I→C cuando hay ingreso regla B **pendiente o ejecutada** con criterio de magnitud en rollout; evita duplicar −me frente a Pago/Ajuste; interacción documentada en código con **compensación** y **cp_ic** (derivación MC / `usarMulticontraparteSync`).
- **CC intermediario §1.1.1:** comisión / MonE en **negativo** donde corresponde (motor con tasa sobre transferencia al intermediario; ramas MC manual).
- **Datos en transacciones:** enriquecimiento / sync que rellena **`cobrador_cliente_id`** en patas Pandy|Inter→Cliente cuando faltaba UUID (evita huecos de patrón / regla B en órdenes tipo inventario **68**).
- **Compensación y sync:** lógica para **no** duplicar líneas de compensación CC cuando ya existe la pata MonR nueva; dedupe **Compromiso de pago** plano vs `compensacion_cc_monto_aplicado` (flip); **no forzar auto-MC** en sync si hay `compensacion_cc_monto_aplicado` (coherencia con flip).
- **Instrumentación:** lectura/escritura de **`multicontraparte_sync_no_auto`** (wizard: operador apaga Multi y el sync no la reactiva sola).
- **Tests unitarios** de compensación / flip actualizados donde tocaba el libro CC: `tests/unit/compensacion-cc-flip-logica.test.mjs`.

### 7.3 SQL y migraciones (en repo)

Scripts de **inventario / auditoría / diff** y migraciones alineados al análisis MonR/MonE (ejecutar en Supabase según procedimiento interno), entre otros:

- `sql/inventario_patron_cc_regla_b_candidatas.sql` — patrón amplio.
- `sql/inventario_patron_afecta_saldo_resync_heuristica.sql` — flags y netos por trx.
- `sql/inventario_patron_cc_saldos_por_entidad_ordenes_patron.sql` — saldos por entidad en órdenes del patrón.
- `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` — diff cliente MonR/MonE (criterio §2 / §4.3).
- Migraciones / backfills relacionados: p. ej. `sql/migracion_transacciones_backfill_cobrador_cliente_id_egreso_pandy_int_hacia_cliente.sql`, `sql/migracion_reglas_usd_ars_ars_usd_int_cp_ic_pp_contrapartida_false.sql`, `sql/auditoria_cc_pre_deploy_usdusd_int_pata_prestamo.sql` (revisar comentarios al inicio de cada archivo para alcance exacto).

### 7.4 Documentación de continuidad

- `docs/CUENTA_CORRIENTE_Y_CAJA.md` — actualizado en el mismo hilo de trabajo para reflejar reglas B, MC, compensación y nueva convención donde aplica.

### 7.5 Pruebas manuales — órdenes 32 a 39 (desarrollo, front local)

Batería ejecutada por el dueño de producto contra **Supabase de desarrollo** con **`npm run dev`** (aplicación en local).

| Campo | Detalle |
|--------|---------|
| **Órdenes** | **`ordenes.numero` 32, 33, 34, 35, 36, 37, 38 y 39** |
| **Alcance** | Todos los **tipos de operación** del entorno dev que quedan **alcanzados** por la nueva regla MonR/MonE (patrón amplio + rollout, fuera de la exclusión §4.4 donde corresponda). |
| **Resultado** | **Todas las pruebas exitosas** (sin fallos registrados en esta corrida). |

*Nota:* esto **no** reemplaza inventario SQL ni E2E automatizados; documenta evidencia de uso real en dev antes de prod.

---

## 8. Próximos pasos (orden de trabajo recomendado)

Orden pensado para **no** mezclar saldos en prod: cada ítem puede cerrarse con PR/commit y, si aplica, entrada en bitácora.

### 8.1 Paso 1 — Invariante, neteo, dedupe y compensación (**cerrado** — revisión + tests de paridad)

**Objetivo:** que `validarInvarianteNeteoCcClienteAcuerdoCerrado`, `sumaMovimientosPataMonRExentosNeteo`, `sumaMovimientosPataMonEExentosNeteo`, deduplicaciones (`filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx`, etc.) y ramas con **`compensacion_cc_monto_aplicado`** sigan siendo **correctas y completas** para:

- órdenes **con** rollout nueva regla (fuera de las 8),
- órdenes **sin** rollout (legacy + las 8 excluidas),
- órdenes con **MC** manual / automático, **cp_ic**, **USD-USD+int**, e **intermediario**.

**Cierre (2026-04-21):** revisión de código en `main.js` + tests de **paridad** en `tests/unit/cc-invariante-nueva-regla-neteo.test.mjs` (`npm run test:unit-cc-invariante-nueva-regla`):

| Bloque | Funciones / ramas revisadas | Tests |
|--------|-----------------------------|--------|
| **MonR / MonE exentos** | `sumaMovimientosPataMonRExentosNeteo` (incl. §1.3.4), `sumaMovimientosPataMonEExentosNeteo` (plantillas §1.2.1 + legacy subP + ajuste) | Sí |
| **A — Compensación** | `sumaMovimientosCompensacionParcialTotalCcExentosNeteo` + `conceptoCcEsCompensacionSaldoFlipConcepto` | Sí |
| **B — Offset I→C + comp** | `sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx` (excluye fila con §1.3.4 en concepto) | Sí |
| **C — Dedupe plano** | `filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx` (cruce no toca; plantillas MonE distintas no colapsan; MC spread ±me) | Sí |
| **D — cp_ic** | `validarInvarianteNeteoCcClienteAcuerdoCerrado`: retorno anticipado **USD-ARS / ARS-USD + int** patrón **cp_ic** con instrumentación toda ejecutada (no exige neteo solo-CC-USD en ese caso; ver comentario ~12348 en `main.js`) | Documentado (sin réplica en test: depende de muchas helpers) |

**Mantenimiento:** si se edita el invariante en `main.js`, actualizar las réplicas en el archivo de test o extraer helpers compartidos. **Regresión en prod:** si una orden vuelve a bloquear sync por neteo, anotar **número de orden** y **moneda** y sumar un caso mínimo al `.test.mjs`.

### 8.2 Paso 2 — IN de exclusión del rollout (**cerrado — decisión de producto**)

**Decisión §4.4:** las órdenes **17, 45, 57, 64, 68, 81, 87, 91** **no** deben tomar el motor nuevo (riesgo de saldo bajo heurística diff); quedan en **legacy** vía `NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4`.

**Ampliación 2026-04-22 (prod):** se sumaron **14, 22, 44, 52, 69, 70, 71** al mismo IN (convivencia de lotes en **14**; resto para revertir a legacy al re-sync). **IN total: 15 números** (ver **§1.3.3**).

**No** se planifica migración masiva para “pasarlas” a la nueva regla; con código desplegado, **re-sincronizar** cada orden excluida regenera CC en **legacy**. La verificación §4.5–§4.6 y el inventario **§4.4** siguen válidos para el subconjunto §4.4; las siete añadidas son decisión operativa aparte.

### 8.3 Aclaración — Qué quería decir “SQL diff vs §1.3 MonR” (**no es un pendiente**)

**En una frase:** el script `inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` sirve para el informe “¿el neto CC **hoy** (legacy) se parece al objetivo teórico de la regla nueva?”. Para la pata **MonR**, el SQL usa las reglas del **§2** (p. ej. en **cruce de divisas** compara **magnitudes**; en **misma moneda** compara **neto con signo**). Eso es **solo la definición del informe / heurística de diff**, no es lo mismo que redactar palabra por palabra cómo la app **emite** cada fila bajo **§1.3** (leyenda, + por trx, etc.).

**Por qué existía el párrafo “§8.3” en el plan:** por si algún día querían que el **texto del “afectado MonR”** en el SQL coincidiera **exactamente** con el criterio de emisión **§1.3** (un solo criterio semántico en doc + SQL). **No** es necesario para que el producto funcione: el rollout y el **IN** de exclusiones están cerrados por producto (§4.4 + ampliación **§1.3.3**); **§4.7** alineó al detector lo que hacía falta para **quién entra** al patrón y **mismos conteos**. Si el informe SQL y el §1.3 no usan la misma frase para “afectado”, es una **diferencia de definición en el reporte**, no un bug del motor ni un paso obligatorio antes del deploy.

### 8.4 Paso 4 — Despliegue y cierre documental

Deploy a producción cuando corresponda; verificación en app de muestra del patrón amplio **fuera** de las 8; actualizar referencias cruzadas en `docs/CUENTA_CORRIENTE_Y_CAJA.md` y, si aplica, `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`.

### 8.5 Post-deploy producción (2026-04-22) — MCP, leyendas en BD y lección del re-sync

Queda asentado para retomar con frescura (dueño de producto + técnico).

#### 8.5.1 Verificación Supabase MCP (Pandy **prod**)

- **Patrón amplio** MonR/MonE (misma definición que `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`, sin anuladas): **16** órdenes.
- **Diff CC cliente** (heurística §2, umbral **0,02**): **7** órdenes con diff en alguna pata — **17, 45, 57, 64, 68, 87, 91**. Todas están en el **IN** de **15** (legacy **a propósito**). La **81** ya **no** figuraba entre las diff en esa corrida (alineación tras re-sync respecto del informe).
- **Órdenes con rollout** (mismo patrón amplio y `numero` **fuera** del IN): **1** orden en ese universo; **0** diffs MonR/MonE en cliente y **0** incumplimientos de textos:
  - movimientos CC enlazados a ingreso **MonR** del patrón con `|monto| > 0,02` debían contener la leyenda **§1.3.4** (*«La empresa asume el compromiso de pago del cliente ( Afecta CC Cliente ).»*);
  - movimientos enlazados a egreso **MonE** del patrón debían usar plantillas **§1.2.1** (*«Compromiso de pago hacia el cliente - …»* / *«Pago hacia el cliente - …»*, alineado a `main.js`).

#### 8.5.2 Leyendas nuevas **persistidas** en `movimientos_cuenta_corriente` (prod)

Conteo global (movimientos no anulados, no manuales):

| Texto buscado | Movimientos | Órdenes distintas |
|----------------|------------:|------------------:|
| Leyenda MonR §1.3.4 (substring canónico) | **1** | **1** |
| Plantillas MonE §1.2.1 (compromiso / pago hacia el cliente) | **2** | **1** |

La orden con filas que ya llevan esa redacción en prod fue la **48** (ej.: concepto tipo catálogo *Compromiso de Pago - Orden 48 y Trans …* con el sufijo §1.3.4 entre paréntesis). **No** implica que el resto del universo esté “mal”: las **15** del IN **no** deben mostrar motor nuevo hasta decisión explícita; fuera del patrón amplio puede haber otras órdenes con el tiempo.

#### 8.5.3 Lección operativa — El deploy no fue “solo leyendas”

**Hecho:** además de leyendas y plantillas MonR/MonE, el trabajo en `main.js` tocó **signos y ramas compartidas** del motor de CC (intermediario §1.1.1, compensación, neteos, invariantes, tipos con patrones parecidos, etc.).

**Consecuencia al re-sincronizar:** la sync **regenera** movimientos con la **regla vigente en código**, no hace **rollback** al estado previo al deploy.

- Los **saldos netos** por moneda pueden **casi no moverse** si el cierre contable con las trx actuales sigue siendo el mismo.
- Igual puede **no** recuperarse el **desglose “original”** (línea a línea, signos intermedios, textos) respecto de un export o una expectativa “pre-cambio”.

**IN de exclusión del rollout:** excluye el **bloque nueva regla MonR/MonE** (rollout §1.3.3); **no** aísla por completo a una orden de **todo** cambio de signo o helper que el motor siga ejecutando por otras condiciones.

**Si hiciera falta el histórico literal pre-deploy:** no alcanza con “volver a sincronizar”; hay que acordar **restauración desde backup** o **backfill** explícito.

---

## 9. Referencias

- `docs/CUENTA_CORRIENTE_Y_CAJA.md` (continuidad + Regla B actual).  
- `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`.  
- `docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md` (Modelo B / compensaciones en libro, paralelo).  
- Inventario: `sql/inventario_patron_cc_regla_b_candidatas.sql`, `sql/inventario_patron_afecta_saldo_resync_heuristica.sql`.  
- Diff MonR/MonE (cliente): `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql`.  
- Detector patrón amplio + rollout §4.4: `utils/cc-patron-nueva-regla-monr-mone.mjs` (`esPatronAmplioCcMonrMoneNuevaRegla`, `nuevaReglaCcRolloutActivoParaOrden`).
