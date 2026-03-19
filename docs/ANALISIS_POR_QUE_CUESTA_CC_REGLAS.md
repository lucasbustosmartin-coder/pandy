# Por qué nos cuesta dejar en tabla todo el comportamiento posible (CC reglas)

Análisis a partir del Excel de referencia y lo que venimos implementando. **Sin código**: solo diagnóstico conceptual.

---

## 1. En el Excel hay DOS inclusiones distintas por cuenta

Para cada operación el Excel define **dos cosas** por lado (cliente / intermediario):

- **SALDO CC … INCLUYE (Y/N):** ¿esta fila **suma al número** que mostramos como saldo?
- **DETALLE CC … INCLUYE (Y/N):** ¿esta fila **aparece como línea** en el detalle de movimientos?

Y **no van siempre juntas**. En tu escenario:

- **Tx3** (Pandy→Intermediario, Pendiente): SALDO INTERMEDIARIO **Y** (-200.000), DETALLE INTERMEDIARIO **N**.
- **Tx4** (Intermediario→Pandy, Ejecutada): SALDO INTERMEDIARIO **N** (197.000 no suma), DETALLE INTERMEDIARIO **Y**.

Es decir: una misma transacción puede “sumar al saldo” y no ir al detalle, o “ir al detalle” y no sumar al saldo. Son dos decisiones independientes.

En la tabla `cc_modelo_reglas` tenemos **una sola** noción de “incluir” por lado (`incluir_en_mov_cc_cliente` / `incluir_en_mov_cc_intermediario`), que en la práctica mezclamos con “¿se escribe un movimiento?”. Entonces nos vemos obligados a elegir: o bien lo que escribimos sirve para el saldo, o bien para el detalle. No podemos modelar “suma pero no se muestra” y “se muestra pero no suma” con un solo flag por fila de regla.

**Conclusión:** nos falta **separar explícitamente** en el modelo (y si hace falta en el esquema) “contribuye al saldo” vs “aparece en el detalle”. Hoy está todo colapsado en un solo “incluir”.

---

## 2. Saldo y detalle no tienen por qué coincidir (en el Excel)

En el Excel, el **saldo** se obtiene sumando solo las filas con **SALDO INCLUYE = Y**. El **detalle** es la lista de filas con **DETALLE INCLUYE = Y**. Como esos conjuntos pueden ser distintos, **la suma de las líneas del detalle no tiene por qué ser igual al saldo**.

Nosotros venimos asumiendo “detalle = saldo” (que la suma de lo que mostramos sea el número del saldo). Eso es una restricción que puede no estar en tu regla de negocio: en el Excel es válido que el detalle muestre, por ejemplo, solo +197k y el saldo sea -200k (calculado por otro conjunto de filas). Mientras sigamos forzando “sum(detalle) = saldo”, cualquier caso donde SALDO INCLUYE y DETALLE INCLUYE difieran nos va a costar y vamos a parchear con “contribución” en el front.

---

## 3. La regla es por “par” y por estado global, no solo por transacción

El comportamiento de una fila en el Excel depende del **par** (Tx1–Tx2 o Tx3–Tx4) y del **estado de la contrapartida**. Por ejemplo:

- Tx3 Pendiente, Tx4 Ejecutada → una pata “suma” (Tx3), la otra “se muestra” (Tx4).
- Si cambia el estado de Tx4, cambia qué hace Tx3 (suma/detalle) y al revés.

En la tabla tenemos **4 filas por tipo** (estado × contrapartida_ejecutada). Eso permite capturar “mi estado” y “estado de la contrapartida”, pero el **estado efectivo** del flujo es el de las **dos** transacciones del par. No estamos codificando, por ejemplo, “Tx1 E + Tx2 P” como un solo escenario con dos reglas acopladas (una para Tx1, otra para Tx2), sino dos lookups separados. Eso está bien siempre que las dos inclusiones (saldo y detalle) queden bien definidas por esas 4 filas. El problema es que con **una sola** noción de “incluir” no podemos expresar “esta pata suma, la otra va al detalle”.

---

## 4. Comisiones con signo invertido y tercer tipo de fila

En el Excel, las comisiones tienen **SIGNO_CC** invertido respecto al tipo (Egreso → + en la CC del intermediario, etc.) y además su propia lógica de SALDO INCLUYE y DETALLE INCLUYE. Eso es un **tercer “tipo” de fila** (transacción principal vs comisión) con reglas distintas. La tabla ya distingue por `es_comision`, pero si además las comisiones tienen otra combinación de “suma al saldo” vs “va al detalle”, volvemos al mismo techo: nos falta el doble flag por lado.

---

## 5. Qué nos falta para contemplar “todas” las combinaciones

Resumido:

1. **Dos flags por lado en el modelo (y quizá en la tabla de reglas):**  
   - Uno: “esta fila **suma al saldo**” (SALDO INCLUYE).  
   - Otro: “esta fila **aparece en el detalle**” (DETALLE INCLUYE).  
   Así cada combinación (estado × contrapartida) puede decir explícitamente Y/N para saldo y Y/N para detalle.

2. **Cálculo de saldo y de detalle por separado:**  
   - Saldo = suma de movimientos (o de contribuciones) donde la regla tiene “suma al saldo” = Y.  
   - Detalle = listar solo movimientos donde la regla tiene “aparece en detalle” = Y.  
   Sin imponer que sum(detalle) = saldo; si el Excel lo tiene así en algún caso, saldría solo.

3. **Persistir en cada movimiento qué regla se usó (o los dos flags):**  
   Si escribimos en `movimientos_cuenta_corriente` / `movimientos_cuenta_corriente_intermediario`, para poder “sumar al saldo” y “mostrar en detalle” con criterios distintos, cada fila tendría que saber si “suma al saldo” y si “va al detalle” (o un identificador de regla que nos dé esos dos datos). Si no, no podemos filtrar distinto para saldo vs detalle a partir de una sola tabla de movimientos.

4. **Revisar el Excel fila a fila** y armar una tabla de verdad (por ejemplo en `docs/`): para cada combinación (tipo de op, pagador, cobrador, es_comision, estado, contrapartida_ejecutada), anotar SALDO INCLUYE y DETALLE INCLUYE para cliente y para intermediario. Eso sería la “especificación completa” y sobre eso se puede ver si con 4 filas por tipo alcanza o si hace falta más granularidad (por ejemplo por estado global del par).

---

## 6. Por qué “algo nos falta”

En una frase: **nos falta modelar que “sumar al saldo” y “aparecer en el detalle” son dos decisiones independientes**. Mientras la tabla y el código traten “incluir” como una sola cosa, vamos a seguir encontrando casos (como el de tu escenario actual) donde el Excel hace una cosa y nosotros otra, y vamos a parchear con contribuciones y excepciones en lugar de que la tabla de reglas exprese todo el comportamiento posible.

---

*Documento para revisar entre sesiones. No modifica código.*
