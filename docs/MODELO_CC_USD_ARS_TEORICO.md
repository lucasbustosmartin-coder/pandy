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

- **Por transacción** = **dos líneas** en CC (una por **línea** en `reglas_de_negocio`: p. ej. exposición en ARS + exposición en USD), salvo combinaciones donde la tabla defina explícitamente una sola línea.

Así, cuando **ambas** transacciones están **ejecutadas** (**E,E**) y la contrapartida también está ejecutada:

- Hay **cuatro** movimientos de CC cliente: **dos** por Tx1 y **dos** por Tx2.
- En cada moneda, los importes **se compensan** (el acuerdo está cumplido → **nadie debe a nadie** en ese swap):
  - **ARS**: suma 0.
  - **USD**: suma 0.

No es “menos líneas para que el saldo cierre”: es **cuatro líneas** que **netean**; si el saldo no da 0, falta una pata o sobra una línea mal definida en `reglas_de_negocio`.

## Implementación

- **USD-ARS sin intermediario**: filas en **`reglas_de_negocio`** (`tipo_operacion_codigo = 'USD-ARS'`, `usa_intermediario = false`).
- **Motor en app**: `aplicarMotorCcDesdeReglasDeNegocio` en `main.js` (una fila de regla → un movimiento CC; `monto_origen` con prorrateo si hay N transacciones que suman el acuerdo; `entidad_cc` para intermediario cuando aplica).

## Regla de verificación rápida

Antes de aceptar un cambio en reglas o en el motor, preguntar:

1. ¿Esta transacción refleja **entrada o salida** de dinero en cada moneda que participa?
2. Con **E,E**, ¿hay **dos movimientos por transacción** en las dos monedas y **saldo 0** en USD y ARS?

Si la respuesta es coherente con el negocio, el modelo está alineado.
