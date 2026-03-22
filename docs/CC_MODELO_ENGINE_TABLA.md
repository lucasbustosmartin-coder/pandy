# Motor de CC impulsado por la tabla `cc_modelo_reglas`

La lógica de cuenta corriente (qué movimientos crear, signos, qué suma al saldo) debe **salir de la tabla** `cc_modelo_reglas`, no de reglas fijas en el front. Así el sistema es **indiferente al tipo de operación**: si mañana se agrega USD-ARS con intermediario, solo se cargan filas en la tabla y el mismo motor aplica.

---

## Principio

1. **Fuente de verdad:** tabla `cc_modelo_reglas` (por `tipo_operacion_codigo`, `usa_intermediario`, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, **`linea_motor`**). Varias filas con la misma clave lógica y distinto `linea_motor` (0, 1, …) definen **varios movimientos CC** para la misma transacción sin lógica por tipo en el front (`sql/migracion_cc_modelo_reglas_linea_motor.sql`).
2. **Moneda y monto de exposición (opcional, por fila):** columnas `cc_cliente_moneda_exposicion`, `cc_cliente_monto_referencia`, `cc_intermediario_moneda_exposicion`, `cc_intermediario_monto_referencia`. Valores de moneda: `orden_recibida`, `orden_entregada`, `transaccion`. Valores de monto: `mr`, `me`, `monto_transaccion`, y para intermediario además `monto_efectivo_intermediario`. Si **ambas** columnas de un lado son `NULL`, el motor usa la **lógica legacy** (p. ej. ingreso Cliente→Pandy en moneda recibida y `mr`). En tipos **sin intermediario**: **ARS-USD y USD-ARS** usan por defecto **ingreso** Cliente→Pandy = `orden_entregada` + `me`; en **USD-USD** el ingreso usa `transaccion` + `monto_transaccion` (cobro bruto). En todos, **egreso** Pandy→Cliente = `transaccion` + `monto_transaccion`, salvo la fila **pendiente + contrapartida ejecutada** que expone `orden_recibida + mr` (espejo en detalle). (`sql/cc_modelo_reglas_tabla.sql`, `sql/cc_modelo_reglas_todas_combinaciones.sql` §2, `sql/migracion_cc_modelo_reglas_moneda_exposicion.sql`). **Excepciones (fuente de verdad en tabla):** (a) fila **ingreso**, `estado_transaccion = pendiente`, `contrapartida_ejecutada = true` (ej. Tx2 ejecutada, Tx1 pendiente) → `orden_recibida` + `mr`, concepto `compromiso_cobrar`, suma saldo e incluye movimiento; (b) fila **egreso**, `estado_transaccion = pendiente`, `contrapartida_ejecutada = true` → `orden_recibida` + `mr`, `incluir_en_mov_cc_cliente = true`, `sumar_al_saldo = false` (espejo conciliador en Movimientos); (c) en USD-USD, comisión ejecutada con par cliente cerrado (`ejecutada` + `contrapartida_ejecutada = true`) suma saldo para cerrar con cobro bruto y egreso. Migraciones puntuales: `sql/migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql`, `sql/migracion_cc_modelo_reglas_egreso_pendiente_par_espejo_mr_detalle.sql` y `sql/migracion_cc_modelo_reglas_usd_usd_cobro_bruto_y_cierre_comision.sql`.
3. **Motor genérico:** dado una orden y sus transacciones (y comisiones), el front:
   - Obtiene `codigo` del tipo de la orden (`tipos_operacion`) y **`usa_intermediario` del catálogo** (`tipos_operacion.usa_intermediario` vía join), **no** desde `ordenes.intermediario_id` (pueden existir dos filas con el mismo código: con/sin intermediario; ver `docs/TIPOS_OPERACION_UNICIDAD_CODIGO.md`).
   - **Histórico (obsoleto en app):** antes se cargaba `cc_modelo_reglas` con `getReglasCcModelo`; hoy el sync usa solo **`reglas_de_negocio`**.
   - Si **no hay reglas** → fallback al comportamiento actual.
   - Si **hay reglas** → para cada transacción y cada comisión deriva (estado, contrapartida), **busca la fila** en reglas y aplica **solo lo que diga la tabla**: crea movimiento en CC cuando `regla.incluir_en_mov_cc_cliente` o `regla.incluir_en_mov_cc_intermediario` es true (o cuando suma al saldo). No se agregan condiciones ad-hoc en el front; la tabla define qué aparece en el listado de Movimientos. En tipos **sin intermediario**, con par cliente cerrado el ingreso Cliente→Pandy debe llevar `incluir_en_mov_cc_cliente = true` para que se vea **Cobro Realizado** junto al egreso y la comisión (`sql/migracion_cc_modelo_reglas_sin_int_incluir_cobro_par_cerrado.sql`).

4. **Comisiones sin transacción propia:** la tabla tiene `condicion_estado_comision`. El motor (`estadoEfectivoComision`) interpreta el nombre y devuelve estado efectivo (ejecutada/pendiente). Condiciones: `par_pandy_int` = ejecutada si Tx3 o Tx4 ejecutada (Comisión Intermediario); `par_cliente` = ejecutada si par cerrado (Tx1 y Tx2) O Tx2 ejecutada (Comisión Pandy; así P,E,P,P da saldo 200k y detalle 195k+5k). Con eso se hace lookup y se incluye o no el movimiento.

---

## Flujo del motor (sync CC)

1. Cargar reglas: `select * from cc_modelo_reglas where tipo_operacion_codigo = ? and usa_intermediario = ?`.
2. **Por cada transacción** `t`:
   - `estado` = t.estado (pendiente/ejecutada).
   - `contrapartida_ejecutada` = la otra pata del par (cliente↔pandy o pandy↔intermediario) está ejecutada.
   - `reglasTx = lookupReglas(...)` (todas las filas que matchean, ordenadas por `linea_motor`); el match usa **booleanos estrictos** (`coercePgBooleanStrict`) para `es_comision` y `contrapartida_ejecutada`, y los flags `suma_saldo` / `incluir` al armar filas, para que un valor string `"false"` no se trate como verdadero.
   - Por **cada** `regla` en `reglasTx`, si aplica cliente/intermediario según flags y signo, agregar la fila CC correspondiente.
3. **Por comisión Pandy:** se obtiene `condicion_estado_comision` de la tabla (ej. `par_cliente`). estado_efectivo = estadoEfectivoComision(transacciones, condicion); si no hay condición, fallback par cerrado. regla = lookup(reglas, cliente, pandy, ingreso, true, estado_efectivo, parClienteCerrado). Si regla.incluir o suma_saldo → agregar fila.
4. **Por comisión Intermediario:** igual: condicion = getCondicionComision(reglas, pandy, intermediario, egreso) (ej. `par_pandy_int`). estado_efectivo = estadoEfectivoComision(transacciones, condicion). lookup(reglas, pandy, intermediario, egreso, true, estado_efectivo, parIntCerrado). Si incluir o suma_saldo → agregar fila.
5. **Cierre sintético “Cierre orden” (dos monedas, sin intermediario):** solo se aplica si **ninguna** fila de reglas para ese tipo tiene `cc_cliente_moneda_exposicion` ni `cc_cliente_monto_referencia` definidos. Si la tabla usa exposición, el motor ya cierra en una moneda y ese cierre legacy rompería el saldo (duplicaría ARS + USD).
6. Caja se sigue armando por transacción ejecutada (no depende de exposición CC).
7. **Detalle vs exposición (dos monedas):** el movimiento en CC usa `cc_cliente_moneda_exposicion` / `cc_cliente_monto_referencia` cuando están definidos. **Saldo** = suma de **todas** las filas persistidas por moneda (no hay flag por fila en movimientos); las reglas deben definir solo líneas **contables** coherentes. Casos con **dos monedas** y **intermediario** (P,E, etc.) se resuelven con **varias filas** en `cc_modelo_reglas` (`linea_motor`, flags `motor_suprime_espejo_*`) sin duplicar efectos en la misma moneda.
8. **Flags de motor en tabla (fase USD‑ARS sin intermediario):** `motor_suprime_espejo_egreso_mr` y `motor_merge_lookup_contrapartida` en `cc_modelo_reglas` reemplazan el hardcode previo en `main.js` para suprimir el espejo +`mr` duplicado en egreso P→C y para unir lookups por `linea_motor` cuando el par cliente está cerrado. Migración: `sql/migracion_cc_modelo_reglas_motor_espejo_merge.sql`. El front usa fallback si la columna aún no existe en Supabase.

---

## Saldo (resumen CC)

En pantalla: **suma algebraica por moneda** de los movimientos de CC **persistidos** para la entidad (excluye **anulado**). La tabla (`cc_cliente_suma_saldo`, `incluir_en_mov_cc_cliente`, etc.) define **qué** filas genera el motor al sincronizar; no hay columna `sumar_al_saldo` en la tabla de movimientos.

---

## Ventajas

- **Un solo lugar:** cambiar signos o incluir/suma_saldo solo tocando la tabla.
- **Indiferente al tipo de operación:** ARS-ARS, ARS-ARS-CHEQUE, y futuros tipos; si tienen filas en la tabla, el motor aplica.
- **Sin reglas:** si no hay filas para ese (codigo, usa_intermediario), el front usa el fallback actual (no rompe órdenes sin modelo).

---

## Archivos

- **Fuente de verdad extendida (multi‑pata, roadmap espejos en tabla):** `docs/CC_FUENTE_DE_VERDAD_TABLA_Y_MULTI_PATA.md`.
- Motor espejo/merge desde tabla (USD‑ARS sin int): `sql/migracion_cc_modelo_reglas_motor_espejo_merge.sql`.
- Tabla y datos: `sql/cc_modelo_reglas_tabla.sql`.
- Moneda/monto exposición: `sql/migracion_cc_modelo_reglas_moneda_exposicion.sql` (proyectos existentes; no pisa la excepción pendiente+contrapartida en ingreso).
- Ingreso pendiente + contrapartida ejecutada (P,E): `sql/migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql`.
- Condición comisión: `sql/migracion_cc_modelo_reglas_condicion_comision.sql`.
- Detalle solo cuando corresponde (par cerrado = sin movimientos): `sql/migracion_cc_modelo_reglas_incluir_solo_si_suma_saldo.sql` (actualiza incluir_en_mov en la tabla).
- Motor en front: `main.js` — **`getReglasDeNegocio`**, `lookupReglasDeNegocio`, `contrapartidaEjecutada`, `estadoEfectivoComision`, `aplicarMotorCcDesdeReglasDeNegocio`. La tabla `cc_modelo_reglas` ya no se lee en sync.
- Varias filas por clave: `sql/migracion_cc_modelo_reglas_linea_motor.sql`.
