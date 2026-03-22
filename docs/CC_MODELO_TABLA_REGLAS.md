# Tabla `cc_modelo_reglas` – Modelo de cuenta corriente en Supabase

Este documento describe la tabla **`public.cc_modelo_reglas`** en Supabase, que centraliza todas las combinaciones posibles del modelo de cuenta corriente (CC): signos, suma en saldo e inclusión en movimientos, por tipo de operación, pagador, cobrador, tipo de transacción y estado.

Referencia del modelo conceptual: **docs/CC_MODELO_REFERENCIA.md** y **docs/CC_MODELO.xlsx**.

---

## Propósito

- **USD-ARS sin intermediario** no usa esta tabla: ver **`reglas_de_negocio`** y **`docs/REGLAS_DE_NEGOCIO.md`** (`sql/reglas_de_negocio_tabla.sql`).
- **Una sola fuente de verdad** (para el resto de tipos en esta tabla): signo en CC cliente/intermediario, si el movimiento suma al saldo, si se incluye en el detalle de movimientos CC.
- La app puede **consultar esta tabla** en lugar de lógica dispersa en `main.js` (helpers como `contribucionSaldoClienteModeloCc`, `incluirEnMovimientosCcClienteModelo`, etc.).
- Permite **agregar nuevos tipos de operación** o ajustar reglas sin tocar código, editando filas en Supabase.

---

## Estructura de la tabla

| Columna | Tipo | Descripción |
|--------|-----|-------------|
| `id` | uuid | PK. |
| `tipo_operacion_codigo` | text | Código del tipo de operación (ej. `ARS-ARS`, `ARS-ARS-CHEQUE`). |
| `usa_intermediario` | boolean | Si la regla aplica cuando la orden tiene intermediario. |
| `pagador` | text | `cliente`, `pandy` o `intermediario`. |
| `cobrador` | text | `cliente`, `pandy` o `intermediario`. |
| `tipo_transaccion` | text | `ingreso` o `egreso`. |
| `es_comision` | boolean | Si la fila corresponde a una comisión (Pandy o intermediario). |
| `estado_transaccion` | text | **Estado de la transacción:** `pendiente` o `ejecutada`. |
| `contrapartida_ejecutada` | boolean | Si la contrapartida del par está ejecutada; define si esta fila suma al saldo cuando la transacción está pendiente. |
| `cc_cliente_signo` | smallint | Multiplicador del monto en CC cliente: `-1`, `0` (no aplica), `1`. |
| `cc_cliente_suma_saldo` | boolean | Si este movimiento aporta al saldo CC cliente. |
| `incluir_en_mov_cc_cliente` | boolean | Si se crea fila en `movimientos_cuenta_corriente` (solo cuando la transacción está ejecutada). |
| `cc_intermediario_signo` | smallint | Multiplicador en CC intermediario: `-1`, `0`, `1`. |
| `cc_intermediario_suma_saldo` | boolean | Si aporta al saldo CC intermediario. |
| `incluir_en_mov_cc_intermediario` | boolean | Si se crea fila en `movimientos_cuenta_corriente_intermediario`. |
| `concepto_leyenda` | text | Clave para el concepto: `cobro_realizado`, `pago_realizado`, `compromiso_pago`, `comision_acuerdo`. |
| `usa_monto_efectivo` | boolean | Si usar monto con tasa de descuento (ej. Int→Pandy 197k). |
| `condicion_estado_comision` | text | Para es_comision=true: condicion para derivar estado efectivo. `par_pandy_int` = ejecutada si alguna Tx Pandy↔Int ejecutada. Null = siempre ejecutada. |
| `linea_motor` | smallint | `0`, `1`, … Varias filas con la misma clave lógica (mismos campos anteriores salvo `linea_motor`) permiten **varios movimientos CC** para la misma transacción; el motor aplica todas ordenadas. |

**Clave única:** `(tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor)`.

---

## Todas las combinaciones posibles

Por cada **tipo de transacción** (pagador, cobrador, tipo_transaccion, es_comision) se insertan **siempre 4 filas**, una por cada par **(estado_transaccion, contrapartida_ejecutada)**:

| estado_transaccion | contrapartida_ejecutada | Uso típico |
|-------------------|------------------------|------------|
| ejecutada | false | Transacción ejecutada, contrapartida aún no → signo e incluir en mov. |
| ejecutada | true | Ambas patas ejecutadas → mismo signo/incluir, no suma saldo. |
| pendiente | false | Todo pendiente → no aplica (signo 0, no suma, no incluir). |
| pendiente | true | Contrapartida ejecutada, esta pendiente → **suma al saldo** (solo en Tx2 y Tx4 del modelo). |

La app busca por (pagador, cobrador, tipo, es_comision, estado_transaccion, contrapartida_ejecutada) y obtiene **cero o más filas** (ordenadas por `linea_motor`); en el caso típico hay **una** fila por combinación (`linea_motor = 0`). Casos excepcionales declarados en tabla (ej. ARS-USD+int) usan `linea_motor = 1` para un segundo movimiento.

---

## Combinaciones cargadas

### Con intermediario (ARS-ARS, ARS-ARS-CHEQUE)

**6 tipos de transacción** × **4 combinaciones** × **2 códigos** = **48 filas** (Tx1, Tx2, Tx3, Tx4, Comisión Pandy, Comisión Int).

### Sin intermediario (tipos activos: ARS-USD, USD-USD, USD-ARS)

**2 tipos de transacción** (ingreso Cliente→Pandy, egreso Pandy→Cliente) × **4 combinaciones** × **3 códigos** = **24 filas**. Solo CC cliente (intermediario 0, N, N). Misma lógica de signos e incluir/suma_saldo que el par cliente en ARS-ARS.

Resumen de las filas que tienen efecto (signo ≠ 0 o suma o incluir):

| Transacción | Estado | Contrap. | CC cliente signo | CC cliente suma | Incluir mov cliente | CC int signo | CC int suma | Incluir mov int | Concepto |
|-------------|--------|----------|------------------|-----------------|---------------------|--------------|-------------|-----------------|----------|
| Cliente→Pandy ingreso (Tx1) | ejecutada | * | -1 | N | Y | 0 | N | N | cobro_realizado |
| Pandy→Cliente egreso (Tx2) | ejecutada | * | 1 | N | Y | 0 | N | N | compromiso_pago |
| Pandy→Cliente egreso (Tx2) | pendiente | Y | 1 | **Y** | N | 0 | N | N | — |
| Pandy→Int egreso (Tx3) | ejecutada | * | 0 | N | N | 1 | N | Y | pago_realizado |
| Int→Pandy ingreso (Tx4) | ejecutada | * | 0 | N | N | -1 | N | Y | cobro_realizado |
| Int→Pandy ingreso (Tx4) | pendiente | Y | 0 | N | N | -1 | **Y** | N | — |
| Comisión Pandy | ejecutada | * | -1 | N | Y | 0 | N | N | comision_acuerdo |
| Comisión Int | ejecutada | * | 0 | N | N | -1 | N | Y | comision_acuerdo |

---

## Motor impulsado por la tabla

**Nota 2026:** el front **ya no** consume esta tabla en **`sincronizarCcYCajaDesdeOrden`**; la fuente de verdad operativa es **`reglas_de_negocio`**. Este documento describe la semántica histórica de columnas de `cc_modelo_reglas` para quien migre o audite datos viejos. Ver **`docs/REGLAS_DE_NEGOCIO.md`** y **`docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md`**.

---

## Uso en la app

1. **Al cargar CC o al sincronizar:**  
   Obtener reglas para el tipo de operación y si usa intermediario:
   ```js
   const { data: reglas } = await client
     .from('cc_modelo_reglas')
     .select('*')
     .eq('tipo_operacion_codigo', codigo)  // ej. 'ARS-ARS'
     .eq('usa_intermediario', !!orden.intermediario_id);
   ```

2. **Incluir en movimientos CC cliente:**  
   Para una transacción `t` ejecutada, buscar una regla con `pagador = t.pagador`, `cobrador = t.cobrador`, `tipo_transaccion = t.tipo`, `es_comision` según corresponda, `estado_transaccion = 'ejecutada'` y `incluir_en_mov_cc_cliente = true`.

3. **Signo del monto a guardar:**  
   Usar `cc_cliente_signo` o `cc_intermediario_signo` (y `usa_monto_efectivo` para el monto) para armar el `monto` del movimiento.

4. **Contribución al saldo (modelo):**  
   Para cada regla con `cc_cliente_suma_saldo = true` o `cc_intermediario_suma_saldo = true`, verificar si en la orden existe la transacción que coincide (pendiente con contrapartida ejecutada) y sumar `signo * monto` al saldo.

5. **Sin reglas para el tipo de operación:**  
   Si no hay filas para ese `tipo_operacion_codigo` + `usa_intermediario`, la app debe mantener el comportamiento actual (incluir todo / sumar desde movimientos en DB).

---

## Matriz completa (todas las combinaciones)

El Excel solo muestra 4 situaciones de ejemplo; el modelo exige **una regla para cada combinación** (estado de la transacción × contrapartida ejecutada). Ver **docs/CC_MODELO_MATRIZ_COMPLETA.md**: ahí está la matriz derivada del Excel (signo, suma_saldo, incluir) para cada tipo de transacción y cada uno de los 4 pares (ejecutada/false, ejecutada/true, pendiente/false, pendiente/true). El script **`sql/cc_modelo_reglas_todas_combinaciones.sql`** materializa esa matriz (UPSERT) para ARS-ARS, ARS-ARS-CHEQUE (4 transacciones + 2 comisiones) y para ARS-USD, USD-USD, USD-ARS (2 transacciones).

## Script SQL

- **Crear tabla y datos:** ejecutar en Supabase SQL Editor el archivo **`sql/cc_modelo_reglas_tabla.sql`** (crea la tabla con `estado_transaccion`, índices, comentarios, **todas** las combinaciones para ARS-ARS y ARS-ARS-CHEQUE, y RLS de lectura).
- **Dejar todas las combinaciones alineadas con el Excel:** ejecutar **`sql/cc_modelo_reglas_todas_combinaciones.sql`** (UPSERT; corrige signos, suma_saldo e incluir según docs/CC_MODELO_MATRIZ_COMPLETA.md).
- **Si la tabla ya existía** con la columna `transaccion_ejecutada`: ejecutar **`sql/migracion_cc_modelo_reglas_estado_transaccion.sql`** y luego los INSERT de `cc_modelo_reglas_tabla.sql` (o volver a ejecutar el bloque de datos con ON CONFLICT DO NOTHING).

---

## Mantenimiento

- **Nuevo tipo de operación con mismo modelo:** duplicar las filas cambiando `tipo_operacion_codigo`.
- **Cambiar signos o flags:** actualizar la fila correspondiente en Supabase (dashboard o con permiso de escritura si se agrega política).
- **Nueva combinación (ej. otra moneda con intermediario):** insertar filas con la misma estructura; la app las usará si filtra por ese código.
