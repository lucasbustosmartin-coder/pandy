# Tabla `reglas_de_negocio`

## Visión: una sola tabla de verdad

**`reglas_de_negocio`** es la **única** fuente de verdad en la app para reglas que definen CC (y caja vía transacciones/sync). **`cc_modelo_reglas`** ya **no** la consulta el front; puede borrarse en DB con **`sql/migracion_drop_cc_modelo_reglas.sql`**. Checklist: **`docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md`**.

---

Reglas explícitas que la sync traduce en **movimientos de cuenta corriente** (y se puede extender a otros efectos de negocio). Nombre alineado al modelo: **reglas de negocio**, no “motor CC” genérico.

**Edición en la app (admin):** menú crítico **Reglas de negocio (CC)** — permiso `abm_reglas_negocio`, validaciones y réplica de matriz. Ver **`docs/MENU_REGLAS_NEGOCIO.md`**. Pares inversos (ej. EUR-USD / USD-EUR): misma cantidad de filas y monedas correctas — ver **`docs/REGLAS_CRUCE_INVERSO_CONSISTENCIA.md`**.

## Modelo teórico USD-ARS (sin intermediario)

**Resumen:** el tipo **USD-ARS** participa con **dos monedas**; con **dos transacciones** instrumentadas, lo esperado es **dos movimientos CC por transacción** (cuatro en **E,E**), que **se anulan** por moneda cuando todo está ejecutado (saldo 0 en USD y ARS). Detalle: **`docs/MODELO_CC_USD_ARS_TEORICO.md`**.

## Alcance actual

- **`USD-ARS`**, **`ARS-USD`** y **`USD-USD`** con **`usa_intermediario = false`**: filas en `reglas_de_negocio` con **`entidad_cc = 'cliente'`** (USD-ARS/ARS-USD: espejo lógico mr/me y prorrateos; USD-USD: misma moneda, comisión implícita **`mr_menos_me`** = mr − me).
- **`USD-ARS`** con **`usa_intermediario = true`** (flujo inverso): `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql` — ver `docs/REG_NEG_USD_ARS_INT_PASO1.md`. **cp_ic E,E:** mismo criterio de par ± en ingreso C→Pandy (USD); migración compartida `sql/migracion_reglas_cp_ic_ingreso_ee_par_moneda_recibida.sql`.
- **`ARS-USD`** con **`usa_intermediario = true`**: `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql` — ver `docs/REG_NEG_ARS_USD_INT_PASO1.md`. **cp_ic E,E:** par ± en ingreso Cliente→Pandy (moneda recibida); bases viejas: `sql/migracion_reglas_cp_ic_ingreso_ee_par_moneda_recibida.sql`.
- **Revisión par ± en CC (cruces con int, excl. CHEQUE y USD-USD+int):** `docs/REG_INTERMEDIARIO_CRUCES_REVISION_PAR_EJECUTADA.md`.
- **`USD-USD`** con **`usa_intermediario = false`**: **`reglas_de_negocio`** (única fuente; **`sql/migracion_reglas_usd_usd_sin_int.sql`** o `sql/reglas_de_negocio_tabla.sql` actualizado). Comisión = **`mr_menos_me`**. Resumen: **`docs/USD_USD_SIN_INTERMEDIARIO.md`**.
- **`USD-USD`** con **`usa_intermediario = true`**: **`reglas_de_negocio`** — misma matriz cliente que sin int + fila intermediario con **`comision_intermediario`**. **`sql/migracion_usd_usd_intermediario_tipo_y_reglas.sql`**. Resumen: **`docs/USD_USD_CON_INTERMEDIARIO.md`**.
- **`CHEQUE-ARS`** con **`usa_intermediario = true`**: la matriz CC vive en **`reglas_de_negocio`** (`tipo_operacion_codigo = 'CHEQUE-ARS'`, `usa_intermediario = true`). Comisiones Pandy e intermediario como filas `es_comision` con **`condicion_estado_comision`** (`par_cliente` / `par_pandy_int`). Signos CC intermediario: **+** cheque (Tx3), **−** comisión int, **−** efectivo Tx4 (ajuste puntual: **`sql/migracion_reglas_cheque_ars_signos_cc_intermediario.sql`**). Filas **`pendiente`** para Tx1–Tx4 cuando el autocompletar deja las cuatro patas en pendiente: **`sql/migracion_reglas_cheque_ars_int_tx1_tx2_tx3_pendiente.sql`** (incluye Tx4; si aplicaste una versión previa sin Tx4 → **`sql/migracion_reglas_cheque_ars_int_tx4_pendiente.sql`** o **`sql/migracion_reglas_pendiente_contrapartida_false_usd_usd_int_y_cheque_tx4.sql`**). Ver **`sql/migracion_reglas_de_negocio_cheque_ars.sql`**. Resumen: **`docs/CHEQUE_ARS_INTERMEDIARIO.md`**.
- Tipos **sin** filas en `reglas_de_negocio`: el sync usa **fallbacks legacy** (por transacción, CHEQUE, cierre sintético dos monedas). Conviene cargar reglas en tabla para todo tipo **activo** (ver query de cobertura en la doc de migración).

## Script SQL

- **`sql/reglas_de_negocio_tabla.sql`** — crea tabla, **USD-ARS** y **ARS-USD** (sin int y **con int**), **USD-USD** (sin int y con int), **CHEQUE-ARS** con int, RLS. Ya **no** incluye limpieza sobre `cc_modelo_reglas` (tabla legacy eliminada; backup en **`sql/archive/cc_modelo_legacy/`**). USD-ARS / ARS-USD sin int. incluyen **P,P** (`pendiente` + `contrapartida_ejecutada = false`).
- **`sql/migracion_reglas_usd_ars_ar_usd_pp_contrapartida_false.sql`** — bases existentes: agrega P,P sin int. para USD-ARS, ARS-USD y cruces EUR espejo (idempotente).
- Carga puntual ARS-USD: **`sql/migracion_reglas_ars_usd_sin_int.sql`**.
- Carga puntual USD-USD sin int (entornos que ya tenían `reglas_de_negocio` sin `mr_menos_me`): **`sql/migracion_reglas_usd_usd_sin_int.sql`**.
- Si existía la tabla previa **`cc_reglas_usd_ars`**: ver **`sql/migracion_cc_reglas_usd_ars_a_reglas_de_negocio.sql`**.

## Varias transacciones que suman el acuerdo

El acuerdo define **`monto_recibido` / `monto_entregado` (mr/me)** en la orden. Puede haber **varias filas en `transacciones`** (mismo pagador/cobrador/tipo y distinto monto) cuya **suma** coincide con el acuerdo.

Para no duplicar mr/me **enteros** por cada transacción:

| `monto_origen` | Uso |
|----------------|-----|
| `monto_transaccion` | Importe de **esta** transacción (moneda de la trx). |
| `me_prorrateado` | `monto_transaccion * (me / mr)` — pata **entregada** equivalente a un cobro parcial en **recibida** (ej. USD → ARS con TC del acuerdo). |
| `mr_prorrateado` | `monto_transaccion * (mr / me)` — pata **recibida** equivalente a un pago parcial en **entregada** (ej. ARS → USD). |
| `mr` / `me` | Totales del acuerdo (reservados si hiciera falta una regla única por orden; hoy USD-ARS sin int usa prorrateo + `monto_transaccion`). |
| `mr_menos_me` | Comisión implícita **USD-USD** sin intermediario (**mr − me**), fila `es_comision` (solo matchea con par cliente cerrado vía motor). |
| `monto_efectivo_intermediario` | **CHEQUE-ARS** con intermediario: efectivo neto Int→Pandy (**mr × (1 − tasa)**) en Tx4. |

Cada transacción que matchee la clave `(pagador, cobrador, tipo, estado, contrapartida)` genera **sus** líneas CC; la **suma** en cada moneda coincide con el acuerdo si las trx suman bien.

**USD-ARS / ARS-USD P,P (ambas patas pendientes, sin intermediario):** mientras **ninguna** transacción del par está ejecutada, en la app `contrapartidaEjecutada` es **`false`**. Hacen falta filas en `reglas_de_negocio` con **`estado_transaccion = 'pendiente'`** y **`contrapartida_ejecutada = false`** (además de las filas `pendiente` + `true` usadas cuando la contraparte ya ejecutó). Sin esas filas, el sync muestra el aviso de transacciones sin regla. Carga puntual idempotente: **`sql/migracion_reglas_usd_ars_ar_usd_pp_contrapartida_false.sql`** (incluye cruces EUR derivados). El script canónico **`sql/migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql`** y el bootstrap **`sql/reglas_de_negocio_tabla.sql`** incorporan estas filas en instalaciones nuevas o al reemplazar el bloque sin int.

**USD-ARS P,E (ingreso pendiente + egreso ejecutado):** con `contrapartida_ejecutada = false` en el egreso (ingreso Tx1 aún pendiente), el egreso ejecutado lleva **dos líneas** en **ARS** (`linea` 0 y 1, signos −1 / +1, `monto_transaccion`) que **anulan** el efecto del pago en CC, en el mismo criterio que **ARS-USD P,E** (dos USD) y **USD-USD P,E** (dos USD). El **USD** queda solo en el **compromiso a cobrar** del ingreso pendiente (Tx1). Definición de producto: **ejecutado** → par ± que netea en esa moneda; **pendiente** → una línea con su signo.

**ARS-USD P,E (simétrico):** egreso ejecutado con contrapartida false **solo** en **USD** (moneda entregada); **no** la línea ARS `mr_prorrateado` en ese egreso. El ARS pendiente del ingreso queda en **compromiso a cobrar** (moneda recibida).

**USD-USD P,E (misma moneda):** solo **Pandy cumplió** (pagó **me** en caja). Ingreso **pendiente** con `contrapartida_ejecutada = true`: una línea **+monto_transacción** (compromiso a cobrar = deuda del cliente hacia Pandy). Egreso **ejecutado** con `contrapartida_ejecutada = false`: **dos líneas** (`linea` 0 y 1) **−monto_transacción** y **+monto_transacción** para **anular el pago de Pandy** en la CC. Saldo neto **+mr** (distinto del **E,P**, donde el cobro en CC es **−me**, la comisión **−(mr−me)** cerrada y el compromiso **+mr** pendiente → saldo **0**). Ver **`docs/USD_USD_SIN_INTERMEDIARIO.md`**.

**USD-ARS E,E:** cuando ambas transacciones están ejecutadas, el **ingreso** matchea reglas con `contrapartida_ejecutada = true` (la contrapartida egreso ya ejecutó). Esa clave debe incluir **dos líneas** como en la rama `false`: ARS (`me_prorrateado`) **y** USD (`monto_transaccion`), para que el **−USD** del cobro netee el **+USD** del egreso ejecutado true (`mr_prorrateado`). Sin la segunda línea, el saldo USD queda **+mr**. Ver `sql/migracion_reglas_usd_ars_ee_ingreso_ejecutada_true_linea1_usd.sql`.

**ARS-USD E,E:** misma idea con patas invertidas: ingreso ejecutada true debe incluir **USD** (`me_prorrateado`) **y** **ARS** (`monto_transaccion`).

En la app, el **saldo** es la suma algebraica por moneda de esas filas (solo se excluyen **anulados**); las reglas deben cargar solo movimientos coherentes con el negocio.

## Consumo en la app

`main.js`: `getReglasDeNegocio(codigo, usa_intermediario)` consulta **cualquier** `tipo_operacion_codigo`. Si hay filas → **`aplicarMotorCcDesdeReglasDeNegocio`** (cliente e intermediario vía `entidad_cc`). **Ingreso ejecutado** `pagador = cobrador = cliente` con UUID distintos (tercero paga al cliente del acuerdo en **moneda recibida**): si **no** existe fila en la tabla para esa clave, el motor inserta **+m** «Compromiso de pago» con leyenda tercero «cumple pata» en CC del cliente del acuerdo (y puede convivir con filas explícitas en Supabase cuando se agreguen). **Ingreso** `pandy→cliente` en monR al acuerdo sin fila: mismo criterio con leyenda Pandy «cumple pata». **USD-USD** (con o sin intermediario): comisión implícita = fila `es_comision` con `monto_origen = mr_menos_me` cuando **mr > me** y par cliente cerrado. **USD-USD** con int: fila intermediario `comision_intermediario` desde `comisiones_orden`. **CHEQUE-ARS** con int: comisiones y `monto_efectivo_intermediario` desde la orden. Si **no** hay filas → fallbacks legacy (sin `cc_modelo_reglas`).

## Referencia cruzada

- `docs/CC_OPERACION_CIERRE_Y_PIPELINE_SYNC.md` — **recorrido sync → motor → `contrapartidaEjecutada`**, principio de cierre por orden (parcial/total) y por qué una orden ejecutada puede dejar saldo ARS colgado si instrumentación y claves de reglas no coinciden.
- `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md` — **inventario de grietas** del pipeline (motor sin match, legacy, multicontraparte manual, RPC, drift SQL, etc.) frente al invariante de neteo cliente–Pandy por orden cerrada.
- `docs/CC_MODELO_TABLA_REGLAS.md` — semántica histórica de `cc_modelo_reglas` (migración hacia `reglas_de_negocio`).
