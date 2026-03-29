# Regla simple e infalible – Cuenta corriente y caja

La regla se apoya en **cuatro premisas** que toda transacción cumple. A partir de ellas, CC y caja se construyen de forma determinista y sin excepciones.

---

## Las 4 premisas clave (toda transacción)

1. **Siempre tiene un pagador y un cobrador.** No hay transacción sin ambos roles; de ellos sale el signo del movimiento en CC (pagador = entidad → +monto; cobrador = entidad → -monto) y en caja (Pandy cobra +, Pandy paga -).

2. **Siempre tiene una única moneda asociada.** Cada transacción tiene una sola moneda; por tanto, cada movimiento en CC o caja tiene una sola moneda (no se reparte el valor en varias columnas).

3. **Siempre tiene un estado actual: Pendiente o Ejecutada.** Solo las transacciones en estado **Ejecutada** generan movimientos en CC y caja. Si está **Pendiente**, esa transacción no genera ningún movimiento. Así se soportan tanto el ida y vuelta completo como las transacciones intermedias (una ejecutada, otra pendiente).

4. **Algunas transacciones tienen una comisión implícita en el monto** (p. ej. ganancia Pandy en misma moneda, comisión intermediario). Esa comisión se administra en función del estado: solo cuando las patas que la justifican están ejecutadas se registra el movimiento de comisión/cierre correspondiente; si una pata queda pendiente, no se suma y el saldo refleja solo lo ya ejecutado.

---

**Objetivo:** La lógica de CC y caja no depende de leyendas de concepto ni de "momento cero". Solo de estas cuatro premisas: **pagador, cobrador, moneda única, estado (Pendiente/Ejecutada)** y, cuando aplica, **comisión según estado**.

**Regla en una frase:** Solo transacciones **Ejecutada** generan movimientos; cada movimiento tiene **una moneda**; cierres y comisiones se añaden **solo cuando las patas que los justifican están ejecutadas**. Así vale para ida y vuelta completo y para transacciones intermedias (una cerrada, otra pendiente).

---

## 1. Convención de signos (premisa 1: pagador y cobrador)

**Display:** Positivo = nos deben (cliente/intermediario debe a Pandy). Negativo = Pandy debe (entregar o pagar). **Colores en resumen:** verde = positivo (cliente/intermediario debe); rojo = negativo (Pandy debe). La misma regla aplica a cliente e intermediario.

- **CC cliente:**
  - **Cliente pagó** (pagador = cliente) → movimiento **-monto** en general. **Excepción misma moneda (mr = me o comisión implícita):** se usa **-me** (monto a entregar), no -mr. Así Pandy debe en CC el **valor de su transacción** (lo que Pandy se comprometió a entregar), no el monto que el cliente pagó; la comisión implícita no aparece como deuda de Pandy.
  - **Pandy pagó al cliente** (cobrador = cliente) → movimiento **+monto** (me) en general. **Excepción misma moneda con ingreso pendiente:** si el ingreso Cliente→Pandy sigue pendiente, la deuda que debe mostrar la CC es la del cliente (mr), no lo que Pandy ya entregó (me); se usa **+mr**. Así el resumen muestra "cliente debe 4933" (lo que falta por pagar) y no 4849,14.
- **CC intermediario:** misma convención (positivo = nos deben → verde; negativo = Pandy debe → rojo). Para que "Pandy debe" aparezca en rojo, al saldo derivado de movimientos se le restan las transacciones pendientes Pandy→Intermediario; así el neto refleja correctamente la deuda de Pandy.
- **Caja (Pandy):**
  - **Pandy cobra** (cobrador = pandy) → **+monto**.
  - **Pandy paga** (pagador = pandy) → **-monto**.

## 2. Cuándo se escribe un movimiento (premisas 2 y 3: moneda única, estado)

- **Solo cuando la transacción está en estado ejecutada.**  
  Si está pendiente, esa transacción **no** genera movimientos en CC ni en caja. Esto aplica a **cualquier** transacción registrada: da igual el tipo de orden (una moneda, dos monedas, con o sin intermediario). Transacciones intermedias (una ejecutada, otra pendiente) dejan saldo solo por lo ejecutado.
- **Una transacción ejecutada** genera:
  - **Un movimiento en CC cliente** si la transacción involucra al cliente (pagador o cobrador = cliente), con el signo según la convención. **Un movimiento = una moneda** (la de la transacción).
  - **Un movimiento en CC intermediario** si involucra al intermediario (pagador o cobrador = intermediario), con el signo según la convención. Un movimiento = una moneda.
  - **Un movimiento en caja** si Pandy es pagador o cobrador, con el signo según la convención.

## 3. Comisiones y cierres (premisa 4: comisión implícita según estado)

Todos estos movimientos **solo se añaden cuando las transacciones que los justifican están ejecutadas**. Si una pata queda pendiente, no se añade el cierre/comisión/ganancia; el saldo refleja solo lo ejecutado (transacciones intermedias).

- **Comisión intermediario:** se añade **cuando se ejecuta la transacción Int→Pandy** (ingreso a Pandy). Así el ida y vuelta con el intermediario está cerrado: -monto (Pandy paga al int) + montoEfectivoInt (int paga a Pandy) + comisión = 0. Si solo está ejecutada Pandy→Int, no se suma comisión y el saldo Int es -monto.
- **Misma moneda con comisión implícita (mr > me):** El **ingreso** Cliente→Pandy genera en CC **-me** (Pandy debe el valor de su transacción), no -mr. El **egreso** Pandy→Cliente genera **+me**. Saldo con ambas ejecutadas: -me + me = 0. **No** se añade movimiento extra de "ganancia Pandy" en CC; la comisión queda implícita en caja (entra mr, sale me).
- **Cierre orden en dos monedas (ARS-USD, USD-ARS):** Dos movimientos de cierre en CC cliente **solo en legacy** (orden **sin** filas en `reglas_de_negocio` para ese tipo, o sea sin `aplicarMotorCcDesdeReglasDeNegocio` en el sync), cuando **ambas** patas están ejecutadas: cobro al circuito (ingreso Cliente→Pandy o Cliente→Intermediario) y entrega al cliente (egreso Pandy→Cliente **o** Intermediario→Cliente). Si solo una está ejecutada, no hay cierre y el saldo muestra solo la moneda de la transacción ejecutada.
- **Con intermediario y motor `reglas_de_negocio`:** **No** se añade el cierre sintético “Cierre orden”: el motor ya genera los movimientos que cierran la CC; duplicar +monR/−monE dejaría saldos falsos (p. ej. +5M ARS y deuda USD simultánea con ambas transacciones ejecutadas).

## 4. Reversa (ejecutada → pendiente)

- Se actualiza el estado de la transacción a pendiente.
- Se **recalculan** CC y caja para la orden (p. ej. sync: borrar movimientos de la orden e insertar solo los correspondientes a transacciones **ejecutadas**). Así, la transacción revertida deja de generar movimientos.
- Reversión de comisión/ganancia: si corresponde, se revierten las transacciones de comisión o ganancia (y sus movimientos) según la regla de negocio actual.

## 5. Fuente de verdad

- **Orden + transacciones (estado, pagador, cobrador, monto)** son la fuente de verdad.
- **Saldo (resumen CC y totales del modal detalle)** = **suma algebraica por moneda de los movimientos persistidos** en cuenta corriente para esa entidad, **excluyendo solo `anulado`**. Debe coincidir con lo que el usuario suma en la solapa **Movimientos** (mismas columnas USD/ARS/EUR).
- **Reglas de negocio** (`reglas_de_negocio`, `cc_modelo_reglas`): deben generar los movimientos correctos para que la suma refleje la situación real; no se “corrige” el saldo en el front omitiendo filas.
- No se usa el **texto del concepto** para decidir inserts/updates ni para el cálculo del saldo.

## 6. Resumen por tipo de flujo

| Flujo | Qué genera movimientos | Cierre / extra |
|-------|-------------------------|----------------|
| Una transacción ejecutada, otra pendiente (misma moneda) | Solo la ejecutada: ingreso → -me; egreso con ingreso pendiente → +mr (deuda del cliente), no +me | Ninguno. Resumen muestra lo que el cliente debe (mr) si falta el ingreso. |
| Ida y vuelta completo (ambas patas ejecutadas), una moneda | Ingreso -me + egreso +me en CC; si hay intermediario, Pandy→Int + Int→Pandy | Saldo CC = 0 con -me/+me; comisión Int al ejecutar Int→Pandy. |
| Ida y vuelta completo, dos monedas (sin int) | Ingreso + egreso cliente (cada uno en su moneda) | Dos movimientos de cierre (-mr en monR, +me en monE) para saldo 0 en ambas. |
| Ida y vuelta completo, dos monedas **con int. y motor reglas** | Motor `reglas_de_negocio` (sin “Cierre orden” sintético) | Cierre solo vía filas de la tabla; no duplicar +monR/−monE. |
| Cualquier combinación (con int, dos monedas, etc.) | Solo transacciones ejecutadas; un movimiento = una moneda | Cierres y comisión solo cuando las patas que los justifican están ejecutadas. |
