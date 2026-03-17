# Referencia del modelo conceptual CC (docs/CC_MODELO.xlsx)

Este documento resume la lógica del Excel **CC_MODELO.xlsx** (tipo operación ARS-ARS CHEQUE con intermediario), para alinear la app con el comportamiento deseado de las cuentas corrientes. Las celdas que “cambian el comportamiento” están resaltadas en amarillo en el Excel.

---

## Transacciones del flujo (4 + comisiones)

| Nro | Tipo   | Monto   | Pagador → Cobrador      | Contiene comisión |
|-----|--------|---------|--------------------------|-------------------|
| 1   | Ingreso| 200.000 | Cliente → Pandy          | Y (5.000 Pandy)   |
| 2   | Egreso | 195.000 | Pandy → Cliente          | N                 |
| 3   | Egreso | 200.000 | Pandy → Intermediario    | Y (3.000 Int)     |
| 4   | Ingreso| 197.000 | Intermediario → Pandy    | N                 |

Comisiones: se agregan con **signo invertido** respecto al flujo (ej. ingreso 5.000 Cliente→Pandy → CC_CLIENTE = -5.000; egreso 3.000 Pandy→Intermediario → CC_INTERMEDIARIO = -3.000). En el modelo las comisiones tienen siempre `_SUMA_SALDO = N` (no suman al saldo).

---

## Regla 1: Valor CC según estado (inversión de signo al ejecutar)

- **Tx1 (Ingreso Cliente→Pandy):**  
  Pendiente: `CC_CLIENTE = +200.000`.  
  Ejecutada: `CC_CLIENTE = -200.000` (se invierte el signo).

- **Tx2 (Egreso Pandy→Cliente):**  
  Pendiente: `CC_CLIENTE = -195.000`.  
  Cuando Tx1 está ejecutada y Tx2 sigue pendiente, en el modelo aparece `CC_CLIENTE = +195.000` para Tx2 (signo invertido respecto al “natural” del egreso).  
  Ejecutada: sigue `CC_CLIENTE = +195.000` pero deja de sumar (ver Regla 2).

- **Tx3 (Egreso Pandy→Intermediario):**  
  Pendiente: `CC_INTERMEDIARIO = -200.000`.  
  Ejecutada: `CC_INTERMEDIARIO = +200.000` (se invierte el signo).

- **Tx4 (Ingreso Intermediario→Pandy):**  
  Pendiente: `CC_INTERMEDIARIO = +197.000`.  
  Cuando Tx3 está ejecutada y Tx4 sigue pendiente, en el modelo aparece `CC_INTERMEDIARIO = -197.000` para Tx4 (signo invertido).  
  Ejecutada: sigue `CC_INTERMEDIARIO = -197.000` pero deja de sumar (ver Regla 2).

---

## Regla 2: Quién suma al saldo (`_SUMA_SALDO = Y`)

Solo las filas con `CC_CLIENTE_SUMA_SALDO = Y` o `CC_INTERMEDIARIO_SUMA_SALDO = Y` aportan al saldo de esa cuenta. El resto no suma.

**Cliente:**

- Estado inicial: todo `CC_CLIENTE_SUMA_SALDO = N` → Saldo cliente = 0.
- **Cuando Tx1 pasa a Ejecutada:** Tx2 pasa a `CC_CLIENTE_SUMA_SALDO = Y` (celda amarilla). Tx2 tiene `CC_CLIENTE = 195.000` → Saldo cliente = 195.000.
- **Cuando Tx2 pasa a Ejecutada:** Tx2 vuelve a `CC_CLIENTE_SUMA_SALDO = N` → Saldo cliente = 0.

**Intermediario:**

- Estado inicial: todo `CC_INTERMEDIARIO_SUMA_SALDO = N` → Saldo intermediario = 0.
- **Cuando Tx3 pasa a Ejecutada:** Tx4 pasa a `CC_INTERMEDIARIO_SUMA_SALDO = Y` (celda amarilla). Tx4 tiene `CC_INTERMEDIARIO = -197.000` → Saldo intermediario = -197.000.
- **Cuando Tx4 pasa a Ejecutada:** Tx4 vuelve a `CC_INTERMEDIARIO_SUMA_SALDO = N` → Saldo intermediario = 0.

---

## Regla 3: Cálculo del saldo

- **Saldo cliente** = suma de `CC_CLIENTE` de todas las filas (transacciones + comisiones) donde `CC_CLIENTE_SUMA_SALDO = Y`. En el modelo las comisiones tienen siempre N, así que en la práctica solo transacciones.
- **Saldo intermediario** = suma de `CC_INTERMEDIARIO` de todas las filas donde `CC_INTERMEDIARIO_SUMA_SALDO = Y`.

---

## Regla 4: Inclusión en movimientos de cuenta corriente (dos columnas nuevas)

El modelo tiene dos columnas que definen **qué filas generan un movimiento** en las tablas `movimientos_cuenta_corriente` y `movimientos_cuenta_corriente_intermediario` (nombres exactos del Excel **CC_MODELO.xlsx**):

- **INCLUIR EN  MOV CC CLIENTE** (Y/N): si esta fila debe generar un movimiento en la CC del cliente.
- **INCLUIR EN MOV DE CC INTERMEDIARIO** (Y/N): si esta fila debe generar un movimiento en la CC del intermediario.

Solo se crean (insertan) movimientos para transacciones cuya fila en el modelo tiene el valor **Y** en la columna correspondiente. En el Excel, para las 4 transacciones principales: Tx1 y Tx2 **ejecutadas** tienen Y en cliente; Tx3 y Tx4 **ejecutadas** tienen Y en intermediario. Las filas en estado Pendiente tienen N. La columna en celeste «qué movimientos debe verse en detalle intermediario» es INCLUIR EN MOV DE CC INTERMEDIARIO (Y = se muestra en detalle CC intermediario). Las filas con N (no se crea movimiento de “compromiso” en el detalle cuando la contrapartida ya está ejecutada; el saldo se calcula por modelo). **Comisión del intermediario:** solo se incluye en el detalle de CC intermediario cuando al menos una de Tx3 (egreso Pandy→Intermediario) o Tx4 (ingreso Intermediario→Pandy) está ejecutada; si ambas están pendientes, detalle vacío y saldo 0 (no se muestra la comisión).

En el Excel, tras cada “Cambio de estado de transacción”:

| Paso | Saldo cliente | Saldo intermediario |
|------|----------------|----------------------|
| Inicial (todo Pendiente) | 0 | 0 |
| Tx1 Ejecutada             | 195.000 | 0 |
| Tx2 Ejecutada             | 0 | 0 |
| Tx3 Ejecutada             | 0 | -197.000 |
| Tx4 Ejecutada             | 0 | 0 |

---

## Resumen conceptual (causa–efecto entre operaciones)

- **Cliente:**  
  - Al ejecutar el **ingreso** Cliente→Pandy (Tx1), la **contrapartida pendiente** (egreso Pandy→Cliente, Tx2) es la que **empieza a sumar** al saldo cliente, con valor +195.000 (obligación pendiente de Pandy hacia el cliente).  
  - Al ejecutar esa contrapartida (Tx2), deja de sumar → saldo 0.

- **Intermediario:**  
  - Al ejecutar el **egreso** Pandy→Intermediario (Tx3), la **contrapartida pendiente** (ingreso Intermediario→Pandy, Tx4) es la que **empieza a sumar** al saldo intermediario, con valor -197.000 (en el modelo: intermediario “debe” 197k a Pandy → saldo negativo desde la perspectiva que usa el Excel).  
  - Al ejecutar esa contrapartida (Tx4), deja de sumar → saldo 0.

- Las **comisiones** en el modelo no suman (`_SUMA_SALDO = N`); solo se documenta la inversión de signo al agregarlas.

---

## Convención de signos en el modelo (para la app)

- **Cliente – Saldo 195.000** (tras Tx1 ejecutada): representa la obligación pendiente de Pandy de entregar 195.000 al cliente. En la app, si “positivo = a Pandy le deben”, este caso sería **negativo** (-195.000) para mostrar “Pandy debe”. El Excel muestra +195.000 como “monto que suma”; la app puede mostrar -195.000 en pantalla según la convención acordada (verde/rojo).
- **Intermediario – Saldo -197.000** (tras Tx3 ejecutada): en el Excel el intermediario “suma” -197.000; es decir, a favor de Pandy (intermediario debe 197k). La app ya unificó color: verde = a favor de Pandy; este saldo sería verde.

---

## Nota sobre orden de cambios de estado

El modelo del Excel está armado en el orden 1 → 2 → 3 → 4. La lógica a implementar debe ser **independiente del orden**: dados el conjunto de transacciones ejecutadas y pendientes, las reglas anteriores deben determinar de forma unívoca:

1. Qué valor `CC_CLIENTE` / `CC_INTERMEDIARIO` tiene cada transacción (según esté ejecutada o no y según el par al que pertenece).
2. Qué transacciones tienen `_SUMA_SALDO = Y` (la contrapartida pendiente del par cuya otra pata está ejecutada).
3. Saldo = suma de los valores que tienen `_SUMA_SALDO = Y`.

Así, cualquier otra secuencia de cambios de estado (ej. 3 → 4 → 1 → 2, o 2 → 1) debe dar los mismos saldos para el mismo conjunto de transacciones ejecutadas.

---

## Correcciones en el Excel

- La última columna de cada bloque es **CC_INTERMEDIARIO_SUMA_SALDO** (corregido en el Excel).
- Los signos iniciales (CC_CLIENTE / CC_INTERMEDIARIO en estado Pendiente) están alineados con la lógica de inversión al ejecutar; corregidos en el Excel.

## Uso en la app

- **Resumen de saldo:** En `loadCuentaCorriente` el resumen de CC aplica esta regla para **órdenes ARS-ARS con intermediario**: el saldo se calcula desde las transacciones (estado, tipo, pagador, cobrador, monto) con `contribucionSaldoClienteModeloCc` y `contribucionSaldoIntermediarioModeloCc`, de forma independiente del orden en que se hayan cambiado los estados. Para el resto de órdenes se sigue usando la suma de movimientos en DB.
- **Movimientos (insert):** Para órdenes ARS-ARS con intermediario, solo se insertan filas en `movimientos_cuenta_corriente` y `movimientos_cuenta_corriente_intermediario` cuando la fila del modelo tiene **INCLUIR EN  MOV CC CLIENTE** = Y o **INCLUIR EN MOV DE CC INTERMEDIARIO** = Y. Las funciones `incluirEnMovimientosCcClienteModelo` e `incluirEnMovimientosCcIntermediarioModelo` aplican esta lógica al sincronizar CC (`sincronizarCcYCajaDesdeOrden`).

## Tabla de reglas en Supabase

Las mismas reglas (signos, suma saldo, incluir en mov) están centralizadas en la tabla **`public.cc_modelo_reglas`**. Creación y datos: **`sql/cc_modelo_reglas_tabla.sql`**. Documentación: **docs/CC_MODELO_TABLA_REGLAS.md**. La app puede consultar esa tabla para que todo (signos, saldos, detalle, reversa) funcione de forma consistente sin lógica dispersa.

*Documento de referencia a partir de docs/CC_MODELO.xlsx. No modificar código sin validar contra este modelo y contra el Excel.*
