# Modelo teórico — CC y tipo de operación **USD-ARS** (sin intermediario)

Referencia: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/REGLA_CC_SIMPLE_INFALIBLE.md`, `sql/reglas_de_negocio_tabla.sql`.

## Qué administra el modelo

La cuenta corriente registra **entradas y salidas de dinero** (comprometidas o ejecutadas) entre **cliente** y **Pandy**, en la **moneda** que corresponda a cada hecho económico. No “inventa” saldo: el **saldo por moneda** es la **suma algebraica** de los movimientos persistidos (excluye **anulado**).

## Por qué dos monedas

**USD-ARS** significa que el acuerdo involucra **dos monedas**: lo **recibido** en una (p. ej. USD, `mr`) y lo **entregado** en la otra (p. ej. ARS, `me`), con la relación del tipo de cambio del acuerdo.

## Dos transacciones instrumentadas

En el esquema habitual hay **dos transacciones** por orden:

| # | Rol | Sentido económico |
|---|-----|-------------------|
| Tx1 | Ingreso Cliente → Pandy | Pata en la que el cliente entrega hacia Pandy (según instrumentación). |
| Tx2 | Egreso Pandy → Cliente | Pata en la que Pandy entrega hacia el cliente. |

## Dos movimientos CC por transacción (cuatro en total cuando todo cierra)

Para **cada** transacción, el modelo debe poder expresar el efecto en **ambas** monedas del swap cuando corresponde al tipo de operación:

- **Por transacción** = **dos líneas** en CC cuando la combinación lo requiere (p. ej. **E,E** en ambas monedas; **P,E** en la moneda del egreso ejecutado con **dos** movimientos ± que anulan, y **una** línea en la moneda del compromiso pendiente del ingreso). Detalle en `reglas_de_negocio` y `docs/REGLAS_DE_NEGOCIO.md`.

Así, cuando **ambas** transacciones están **ejecutadas** (**E,E**) y la contrapartida también está ejecutada:

- Hay **cuatro** movimientos de CC cliente: **dos** por Tx1 y **dos** por Tx2.
- En cada moneda, los importes **se compensan** (el acuerdo está cumplido → **nadie debe a nadie** en ese swap):
  - **ARS**: suma 0.
  - **USD**: suma 0.

No es “menos líneas para que el saldo cierre”: es **cuatro líneas** que **netean**; si el saldo no da 0, falta una pata o sobra una línea mal definida en `reglas_de_negocio`.

## Implementación

- **USD-ARS sin intermediario**: filas en **`reglas_de_negocio`** (`tipo_operacion_codigo = 'USD-ARS'`, `usa_intermediario = false`).
- **Motor en app**: `aplicarMotorCcDesdeReglasDeNegocio` en `main.js` (una fila de regla → un movimiento CC; `monto_origen` con prorrateo si hay N transacciones que suman el acuerdo; `entidad_cc` para intermediario cuando aplica).

## Con intermediario (ci_pc y cp_ic): transacciones independientes en CC

Con **`usa_intermediario = true`**, las dos transacciones instrumentadas (p. ej. Cliente→Intermediario + Pandy→Cliente, o Cliente→Pandy + Intermediario→Cliente) **no** suman en CC cliente un movimiento extra en la moneda del acuerdo (`+mr`) en una transacción solo para “cerrar” en libros lo ya reflejado en la otra. Cada transacción aporta **solo las líneas de su propia pata** según `reglas_de_negocio`. Migración para bases que tenían el espejo antiguo: `sql/migracion_reglas_cc_int_transacciones_independientes_quitar_espejo_mr.sql`.

En **E,E**, el saldo resumen por moneda **puede no ser cero** en esa vista contable, aunque la operación esté cerrada operativamente: es coherente con mostrar el efecto de cada transacción por separado (sin anular USD/ARS del acuerdo entre Tx1 y Tx2).

## Regla de verificación rápida

Antes de aceptar un cambio en reglas o en el motor, preguntar:

1. ¿Esta transacción refleja **entrada o salida** de dinero en cada moneda que participa?
2. **Sin intermediario**, con **E,E**, ¿hay **dos movimientos por transacción** en las dos monedas y **saldo 0** en USD y ARS? **Con intermediario**, ¿cada transacción solo genera líneas de su pata, sin espejo `+mr` cruzado entre transacciones?

Si la respuesta es coherente con el negocio, el modelo está alineado.
