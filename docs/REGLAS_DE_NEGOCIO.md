# Tabla `reglas_de_negocio`

## Visión: una sola tabla de verdad

**`reglas_de_negocio`** es la **única** fuente de verdad en la app para reglas que definen CC (y caja vía transacciones/sync). **`cc_modelo_reglas`** ya **no** la consulta el front; puede borrarse en DB con **`sql/migracion_drop_cc_modelo_reglas.sql`**. Checklist: **`docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md`**.

---

Reglas explícitas que la sync traduce en **movimientos de cuenta corriente** (y se puede extender a otros efectos de negocio). Nombre alineado al modelo: **reglas de negocio**, no “motor CC” genérico.

## Modelo teórico USD-ARS (sin intermediario)

**Resumen:** el tipo **USD-ARS** participa con **dos monedas**; con **dos transacciones** instrumentadas, lo esperado es **dos movimientos CC por transacción** (cuatro en **E,E**), que **se anulan** por moneda cuando todo está ejecutado (saldo 0 en USD y ARS). Detalle: **`docs/MODELO_CC_USD_ARS_TEORICO.md`**.

## Alcance actual

- **`USD-ARS`**, **`ARS-USD`** y **`USD-USD`** con **`usa_intermediario = false`**: filas en `reglas_de_negocio` con **`entidad_cc = 'cliente'`** (USD-ARS/ARS-USD: espejo lógico mr/me y prorrateos; USD-USD: misma moneda, comisión implícita **`mr_menos_me`** = mr − me).
- **`USD-ARS`** con **`usa_intermediario = true`** (flujo inverso): `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql` — ver `docs/REG_NEG_USD_ARS_INT_PASO1.md`.
- **`ARS-USD`** con **`usa_intermediario = true`**: `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql` — ver `docs/REG_NEG_ARS_USD_INT_PASO1.md`.
- **`USD-USD`** con **`usa_intermediario = false`**: **`reglas_de_negocio`** (única fuente; **`sql/migracion_reglas_usd_usd_sin_int.sql`** o `sql/reglas_de_negocio_tabla.sql` actualizado). Comisión = **`mr_menos_me`**. Resumen: **`docs/USD_USD_SIN_INTERMEDIARIO.md`**.
- **`USD-USD`** con **`usa_intermediario = true`**: **`reglas_de_negocio`** — misma matriz cliente que sin int + fila intermediario con **`comision_intermediario`**. **`sql/migracion_usd_usd_intermediario_tipo_y_reglas.sql`**. Resumen: **`docs/USD_USD_CON_INTERMEDIARIO.md`**.
- **`CHEQUE-ARS`** con **`usa_intermediario = true`**: la matriz CC vive en **`reglas_de_negocio`** (`tipo_operacion_codigo = 'CHEQUE-ARS'`, `usa_intermediario = true`). Comisiones Pandy e intermediario como filas `es_comision` con **`condicion_estado_comision`** (`par_cliente` / `par_pandy_int`). **`cc_modelo_reglas` no debe tener filas CHEQUE-ARS** (ver **`sql/migracion_reglas_de_negocio_cheque_ars.sql`**). Resumen: **`docs/CHEQUE_ARS_INTERMEDIARIO.md`**.
- Tipos **sin** filas en `reglas_de_negocio`: el sync usa **fallbacks legacy** (por transacción, CHEQUE, cierre sintético dos monedas). Conviene cargar reglas en tabla para todo tipo **activo** (ver query de cobertura en la doc de migración).

## Script SQL

- **`sql/reglas_de_negocio_tabla.sql`** — crea tabla, datos USD-ARS + ARS-USD + USD-USD sin int + **USD-USD con int** + **CHEQUE-ARS con int**, RLS, y elimina filas duplicadas en `cc_modelo_reglas` (tipos sin int + **CHEQUE-ARS** + **USD-USD con int**).
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

**USD-ARS P,E (ingreso pendiente + egreso ejecutado):** con `contrapartida_ejecutada = false` en el egreso (porque el ingreso cliente→Pandy sigue pendiente), el egreso ejecutado **solo** genera la línea en **moneda entregada** (ARS). **No** se agrega la línea USD prorrateada en ese egreso: el USD queda representado solo por el **compromiso a cobrar** pendiente del ingreso (Tx1), hasta que esa transacción ejecute. Así el saldo USD no “netea” en cero de forma espuria.

**ARS-USD P,E (simétrico):** egreso ejecutado con contrapartida false **solo** en **USD** (moneda entregada); **no** la línea ARS `mr_prorrateado` en ese egreso. El ARS pendiente del ingreso queda en **compromiso a cobrar** (moneda recibida).

**USD-USD P,E (misma moneda):** solo **Pandy cumplió** (pagó **me** en caja). Ingreso **pendiente** con `contrapartida_ejecutada = true`: una línea **+monto_transacción** (compromiso a cobrar = deuda del cliente hacia Pandy). Egreso **ejecutado** con `contrapartida_ejecutada = false`: **dos líneas** (`linea` 0 y 1) **−monto_transacción** y **+monto_transacción** para **anular el pago de Pandy** en la CC. Saldo neto **+mr** (no el mismo neto **−me** que en **E,P**). Ver **`docs/USD_USD_SIN_INTERMEDIARIO.md`**.

**USD-ARS E,E:** cuando ambas transacciones están ejecutadas, el **ingreso** matchea reglas con `contrapartida_ejecutada = true` (la contrapartida egreso ya ejecutó). Esa clave debe incluir **dos líneas** como en la rama `false`: ARS (`me_prorrateado`) **y** USD (`monto_transaccion`), para que el **−USD** del cobro netee el **+USD** del egreso ejecutado true (`mr_prorrateado`). Sin la segunda línea, el saldo USD queda **+mr**. Ver `sql/migracion_reglas_usd_ars_ee_ingreso_ejecutada_true_linea1_usd.sql`.

**ARS-USD E,E:** misma idea con patas invertidas: ingreso ejecutada true debe incluir **USD** (`me_prorrateado`) **y** **ARS** (`monto_transaccion`).

En la app, el **saldo** es la suma algebraica por moneda de esas filas (solo se excluyen **anulados**); las reglas deben cargar solo movimientos coherentes con el negocio.

## Consumo en la app

`main.js`: `getReglasDeNegocio(codigo, usa_intermediario)` consulta **cualquier** `tipo_operacion_codigo`. Si hay filas → **`aplicarMotorCcDesdeReglasDeNegocio`** (cliente e intermediario vía `entidad_cc`). **USD-USD** (con o sin intermediario): comisión implícita = fila `es_comision` con `monto_origen = mr_menos_me` cuando **mr > me** y par cliente cerrado. **USD-USD** con int: fila intermediario `comision_intermediario` desde `comisiones_orden`. **CHEQUE-ARS** con int: comisiones y `monto_efectivo_intermediario` desde la orden. Si **no** hay filas → fallbacks legacy (sin `cc_modelo_reglas`).

## Referencia cruzada

- `docs/CC_MODELO_TABLA_REGLAS.md` — semántica histórica de `cc_modelo_reglas` (migración hacia `reglas_de_negocio`).
