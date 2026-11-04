# Corazón del sistema: Cuenta corriente y Caja

Este documento define los principios que **siempre** deben cumplirse. El sistema debe funcionar como un **reloj**: determinista, confiable, fuente de verdad.

---

## 1. Cuenta corriente = situación real

- La **cuenta corriente** siempre tiene que reflejar la **situación real** entre:
  - **Pandy y el cliente**
  - **Pandy y el intermediario**
- Lo que muestra la CC (resumen y detalle) debe coincidir con quién le debe a quién en la realidad: signos, pendientes, ejecutadas, comisiones implícitas, misma convención de colores (verde = nos deben, rojo = Pandy debe). Referencia de regla: `docs/REGLA_CC_SIMPLE_INFALIBLE.md`.
- **USD-ARS sin intermediario** (dos monedas, dos transacciones): modelo teórico de **dos movimientos CC por transacción** cuando ambas patas aplican; con todo ejecutado (**E,E**) **cuatro** movimientos que netean por moneda. Ver `docs/MODELO_CC_USD_ARS_TEORICO.md` y `docs/REGLAS_DE_NEGOCIO.md`.
- **Varias transacciones por el mismo acuerdo** (parciales, distintos modos de pago): válido si los totales cierran; CC/caja se derivan **por transacción ejecutada**; cierre legacy dos monedas suma todos los montos Cliente↔Pandy. Ver `docs/INSTRUMENTACION_MULTITRANSACCION_Y_CC.md`.
- **Cierre coherente con la operación (parcial/total):** el conjunto de movimientos CC por orden debe reflejar obligaciones reales cliente–Pandy; si la orden está cerrada y el acuerdo cumplido, no debe quedar posición **fantasma** por desalinear **pagador/cobrador en transacciones** con las **claves de `reglas_de_negocio`** o con **`contrapartidaEjecutada`**. Un acuerdo totalmente ejecutado puede mostrar **saldo distinto de cero** en moneda recibida solo por movimientos con leyenda **«Pandy cumple pata»** o **«Tercero cumple pata»** (misma familia; motor y MC — ver `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md` §3). Ingreso en monR **acuerdo→Pandy** netea en el libro del acuerdo con par −m/+m. Recorrido técnico: `docs/CC_OPERACION_CIERRE_Y_PIPELINE_SYNC.md`.
- **Auditoría de grietas** frente al invariante «orden con acuerdo cumplido → CC cliente–Pandy sin saldo fantasma por moneda»: lista de riesgos (motor sin match, legacy vs motor, multicontraparte manual, RPC, drift SQL, etc.) en `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`.
- **Futuro (sin implementar):** instrumentación **manual libre** ARS-USD / USD-ARS sin int. (N pagos, contrapartes Cliente N o Intermediario N, mismos signos CC acuerdo que hoy en parciales). Definiciones: `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md`.
- **Futuro (sin implementar):** acuerdo explícito **contra cliente o contra intermediario** (ej. USD-ARS comprando USD al intermediario; CC del acuerdo en libro intermediario). Diseño y preguntas abiertas: `docs/CC_ACUERDO_CONTRAPARTE_CLIENTE_O_INTERMEDIARIO.md`.

---

## 2. Caja = dinero real

- La **caja** refleja **dinero real**. Es lo que Pandy tiene en efectivo, banco, etc.
- Si al final del día Pandy va y cuenta los billetes (o concilia con el banco), **tiene que dar lo que el sistema dice**. Solo entran movimientos que representan entradas o salidas reales de dinero (transacciones ejecutadas, movimientos manuales). Referencia: `docs/CONVENCION_MOVIMIENTOS_CAJA.md` y lógica en `main.js` (sync, caja por transacción).
- **Tasa por transferencia al intermediario** (cargo fuera del acuerdo con el cliente): la obligación y el pago contable van por **cuenta corriente Pandy–intermediario**; **no** debe imputarse a **caja de billetes** (`movimientos_caja` efectivo). En la app, cuando aplica esa casuística, `asegurarComisionIntermediario` solo registra `orden_comisiones_generadas` sin insertar fila en caja física (ver `ordenOmitirMovimientoCajaComisionIntPorTasaTransferenciaFueraAcuerdo` en `main.js`). Excepción legacy: **USD-USD** con spread de acuerdo `mr > me` sigue usando egreso en caja para la comisión persistida en la convención anterior.

---

## 3. Reloj: determinismo y fuente de verdad

- CC y caja son el **corazón del sistema**. Deben ser:
  - **Deterministas:** misma entrada (órdenes + transacciones y estados) → mismo resultado.
  - **Derivadas de una sola fuente de verdad:** órdenes e instrumentación (transacciones); no depender de textos de concepto ni de lógica duplicada.
- Cualquier cambio que toque CC o caja debe respetar estos principios y no introducir excepciones ocultas.
- **Estado CC vs instrumentación:** si **todas** las transacciones están **ejecutadas**, toda la CC **derivada** (cliente e intermediario, salvo manual) va a **`cerrado`**; con orden **anulada**, **`anulado`**; con instrumentación **mixta o pendiente**, cada fila sigue el estado de su transacción ancla y las **sintéticas** (sin `transaccion_id`) quedan **pendiente** si aún hay alguna trx pendiente (`refuerzoEstadoCcCoherenteConInstrumentacion`; `docs/FLUJOS_CC_REGLA.md` §7.1).
- **Fechas en movimientos derivados:** al sincronizar CC/caja desde la orden, la **fecha contable** y **`estado_fecha`** de cada fila generada deben alinearse al **hecho** (`fecha_ejecucion` / `updated_at` de la transacción, o transacción de referencia en líneas sintéticas), no al instante del resync. La RPC **no borra** filas derivadas: hace INSERT / UPDATE / ANULAR (`estado = anulado`) y conserva el `id` cuando la clave lógica coincide **y la fila está viva**. **No reabre** un anulado (si el payload pide esa identidad, INSERT). La coherencia temporal del listado depende de fecha y `estado_fecha`. Ver `fechaYEstadoFechaMovimientoCcCajaDesdeTransaccion` en `main.js` y `sql/rpc_sync_cc_caja_orden.sql`.
- **Libro (capa 1):** nada derivado de sync se elimina. Un movimiento vivo que deja de corresponder al payload queda **anulado** (sigue en base y en auditoría): hace falta para no duplicar saldo al ejecutar (compromiso → cobro/pago). **No** se usa el anulado como destino de UPDATE a cerrado. Si hay **gemelos vivos** (misma identidad), la RPC deja la fila más antigua y anula el resto. Un vivo por clave lógica (índices únicos parciales; **no** en prod mientras 28/41/42 tengan gemelos). El cliente **no** reconstruye CC/caja con delete+insert si falla la RPC. **Caja efectivo:** el front no asume efectivo si falta el modo de pago; la RPC no persiste efectivo si la transacción es transferencia, cheque o el modo no está. Auditoría categoría **`cc_caja_sync`**: alta, edición material y anulación, con monto, moneda, caja y medio de pago. El importe se compara y guarda a **4 decimales** para no auditar un editar si el monto no cambió. Control de calidad lista gemelos (`cc_caja_gemelos_vivos`). **Pandy y Pandy-Dev**.
- **Identidad (capa 2):** la clave viva ya **no** incluye el monto. Es transacción + moneda + `sync_clave` (familia de leyenda + signo: p. ej. `compromiso_pago:pos` vs `compromiso_pago:neg`). Un recálculo de importe **actualiza la misma fila**. `sql/migracion_sync_cc_caja_clave_identidad.sql` + `sql/rpc_sync_cc_caja_orden.sql`. **Pandy y Pandy-Dev** (v3.8.20).
- **Refrescar (opción A + lecturas en tanda):** el botón escribe con `sync_cc_caja_ordenes` (lote de órdenes, mismo libro por ítem) y lee órdenes/trx/comisiones en tandas (mismo motor). Por defecto omite ejecutadas fuera del plazo de Seguridad; el Admin elige **Solo el plazo** o **Toda la historia**. Guardar una orden sigue en `sync_cc_caja_orden` con SELECT por orden y no recorta por plazo. **Pandy y Pandy-Dev** (v3.8.20).
- **Exclusión 23, 28, 41, 42 y 106:** esas órdenes **no** se persisten en sync (CC ni caja) para dejar producción como está. No es la lista MonR/MonE. Al desplegar **sí** se tocan **576** y **788**. Cómo volver: `docs/CC_EXCLUSION_SYNC_ORDENES_23_Y_41.md`. Inventario: `docs/CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx`. Censo prod vs Dev: solo diferían 23, 28, 41, 42, 106, 576 y 788.

---

## Regla de ORO (reglas vs. código en `main.js`)

- La **verdad de negocio** de la cuenta corriente (montos que impactan saldo, exposición, comisiones, contrapartida) vive en **`reglas_de_negocio`** (y migraciones en `sql/`); ver **`docs/REGLAS_DE_NEGOCIO.md`**. **CHEQUE-ARS con intermediario** también en esa tabla. La tabla legacy **`cc_modelo_reglas`** ya **no** la lee el front; puede eliminarse en DB (`sql/migracion_drop_cc_modelo_reglas.sql`). No duplicar reglas contables en el frontend.
- El código en `main.js` debe **interpretar `reglas_de_negocio` de forma genérica** (motor de lookup y aplicación de filas). Evitar excepciones por código de operación salvo infraestructura; si hace falta un comportamiento nuevo, **cambiar o ampliar la matriz en Supabase** (y documentar la semántica).
- Ver también la regla del proyecto **Regla de ORO** en `.cursor/rules/reglas-pandi.mdc`.
- **Multi‑pata / varias transacciones:** `docs/CC_FUENTE_DE_VERDAD_TABLA_Y_MULTI_PATA.md` — contexto histórico; nuevas extensiones van sobre **`reglas_de_negocio`** (`linea`, `monto_origen`, etc.).

---

## 4. CC cliente y CC intermediario van juntas

- **No se puede tocar la CC del cliente sin revisar si hay que tocar también la CC del intermediario, ni viceversa.**
- Al modificar:
  - Cálculo o escritura de movimientos de **cuenta corriente cliente** → revisar impacto en **cuenta corriente intermediario** (misma convención de signos, pendientes, resumen, colores).
  - Cálculo o escritura de movimientos de **cuenta corriente intermediario** → revisar impacto en **cuenta corriente cliente** y en la coherencia global (órdenes con intermediario: flujos cliente ↔ intermediario se reflejan en Pandy–Intermediario).
- Validar siempre **ambas** cuentas (cliente e intermediario) al cambiar reglas de movimientos, sync, resumen o detalle.
- **CHEQUE-ARS + intermediario:** convención documentada de **+spread** en CC cliente, omisión de comisión sintética duplicada en CC intermediario cuando toda la comisión es del intermediario y coincide con el spread en Tx3/Tx4, y visibilidad en detalle Movimientos (`incluir_en_detalle`). Ver **`docs/CHEQUE_ARS_INTERMEDIARIO.md`**.

---

## Checklist rápido al tocar CC o caja

- [ ] ¿La CC sigue reflejando la situación real (Pandy–cliente / Pandy–intermediario)?
- [ ] ¿La caja sigue reflejando dinero real (conteo físico / banco debe cuadrar)?
- [ ] ¿Revisé tanto CC **cliente** como CC **intermediario** (y viceversa)?
- [ ] ¿La regla es determinista y está alineada con `REGLA_CC_SIMPLE_INFALIBLE.md` y con la convención de caja?
