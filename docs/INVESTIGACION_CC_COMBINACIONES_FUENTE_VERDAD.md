# Investigación: fallos E2E CC combinaciones y fuente de verdad

Objetivo: determinar si hay que tocar la **única fuente de verdad** (tabla `cc_modelo_reglas` en SQL) para que todas las combinaciones pasen sin correcciones en main.js.

---

## 1. Expectativas y reglas

- **Tests:** `tests/e2e/cc-combinaciones-esperado.js` y `docs/CC_COMBINACIONES_ESPERADO_DERIVACION.md` definen saldo y detalle por combinación.
- **Fuente de verdad:** `sql/cc_modelo_reglas_todas_combinaciones.sql`. Lookup por `(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada)`. Contrapartida: Tx1↔Tx2 (cliente–pandy), Tx3↔Tx4 (pandy–intermediario).
- **Motor (actualizado):** `main.js` → `sincronizarCcYCajaDesdeOrden` carga **`reglas_de_negocio`** con `getReglasDeNegocio`, y si hay filas aplica **`aplicarMotorCcDesdeReglasDeNegocio`** (`lookupReglasDeNegocio`, `contrapartidaEjecutada`, etc.). Ya no se usa `cc_modelo_reglas` en el front.

---

## 2. Qué dice la tabla para CC cliente

Solo pueden escribir en CC **cliente** (cc_cliente_signo ≠ 0):

- **Tx1** (cliente, pandy, ingreso): filas con signo -1 o 0 según (estado, contrapartida).
- **Tx2** (pandy, cliente, egreso): filas con signo 1 o 0.
- **Comisión Pandy** (cliente, pandy, ingreso, es_comision=true): signo 1.

En el SQL, **Tx3** (pandy, intermediario, egreso) y **Tx4** (intermediario, pandy, ingreso) tienen en todas sus filas:

- `cc_cliente_signo = 0`

Por tanto, según la fuente de verdad, el motor **no** debería escribir nunca en CC cliente por Tx3 ni por Tx4.

---

## 3. Combinaciones que fallaron

### 3.1 E,P,P,E — saldo esperado -200.000, app -400.000

- Tx1=E, Tx2=P, Tx3=P, Tx4=E.
- Contrapartida para Tx1: Tx2 ejecutada → **false**. Lookup (cliente, pandy, ingreso, false, **ejecutada**, **false**) → regla con -1, suma_saldo true → **una** fila -200k.
- Tx2 (pendiente), Tx3, Tx4: para cliente o no aplican o tienen signo 0. Comisión: par cliente no cerrado → estado efectivo pendiente → no suma.
- **Conclusión teórica:** una sola fila -200k. Si la app muestra -400k, hay **dos** filas -200k.

### 3.2 E,P,E,P — saldo esperado -200.000, app -400.000

- Tx1=E, Tx2=P, Tx3=E, Tx4=P.
- Mismo criterio cliente: solo Tx1 aporta -200k. Tx3 (pandy, intermediario, egreso) tiene cc_cliente_signo = 0 en la tabla.
- **Conclusión teórica:** una fila -200k. -400k indica de nuevo **doble** -200k.

### 3.3 P,E,P,E — saldo esperado 200.000, app 400.000

- Tx2=E, Tx4=E. Cliente: Tx2 +195k y comisión +5k → 200k.
- Lookup Tx2 (pandy, cliente, egreso, false, ejecutada, contrapartida). Tx1=P → contrapartida **false**. Regla (ejecutada, false) → 1, suma_saldo true → una fila +195k. Comisión (par_cliente: Tx2 E → ejecutada) → una fila +5k.
- **Conclusión teórica:** dos filas (195k + 5k). Si la app muestra 400k, hay **cuatro** filas o dos de 200k (duplicado lógico).

---

## 4. Posibles causas del desvío (sin tocar main)

1. **Contenido real de `cc_modelo_reglas` en Supabase**  
   Si alguna fila de Tx3 o Tx4 tuviera `cc_cliente_signo != 0`, el motor escribiría en CC cliente para esas transacciones y podría aparecer doble -200k (Tx1 + Tx4 o Tx1 + Tx3) o sumas incorrectas en P,E,P,E.

2. **Transacciones duplicadas en la orden**  
   Si por bug o datos hubiera dos transacciones (cliente, pandy, ingreso) para la misma orden, el motor aplicaría la regla de Tx1 a las dos y generaría dos -200k. Análogo para (pandy, cliente, egreso) y +195k.

3. **Lookup / tipos en front**  
   Si `estado_transaccion` o `contrapartida_ejecutada` llegaran con tipo o valor distinto al esperado (ej. string vs boolean), el `lookupRegla` podría matchear otra fila y traer un signo distinto. Menos probable si el resto de combinaciones pasan.

4. **Comisión duplicada o fila extra**  
   En P,E,P,E, si la comisión se aplicara dos veces o hubiera una fila extra de +200k, el saldo daría 400k.

---

## 5. Verificaciones recomendadas (fuente de verdad y datos)

- **En Supabase (SQL Editor):**

  - Confirmar que para `tipo_operacion_codigo = 'ARS-ARS'` y `usa_intermediario = true`:
    - Todas las filas con `(pagador, cobrador, tipo_transaccion) = ('pandy', 'intermediario', 'egreso')` tienen `cc_cliente_signo = 0`.
    - Todas las filas con `('intermediario', 'pandy', 'ingreso')` tienen `cc_cliente_signo = 0`.
  - Si aparece algún `cc_cliente_signo != 0` en Tx3/Tx4 para cliente, **corregir la fuente de verdad**: re-ejecutar `sql/cc_modelo_reglas_todas_combinaciones.sql` o hacer UPDATE hasta que coincida con ese script.

- **Integridad de datos por orden (opcional):**  
  Para una orden de test ARS-ARS con intermediario, comprobar que la instrumentación tiene **exactamente 4 transacciones** (una por Tx1..Tx4) y que no hay dos transacciones con el mismo (pagador, cobrador, tipo) que correspondan al mismo “slot” lógico.

---

## 6. Conclusión

- Según el script SQL actual, **la regla ya está bien** para que solo Tx1/Tx2 y comisión Pandy escriban en CC cliente; Tx3 y Tx4 no deberían aportar nada ahí.
- Si los tests siguen fallando, lo coherente con “no corregir en main” es:
  1. **Asegurar que la base tenga exactamente esa regla** (auditoría anterior).
  2. **Descartar duplicación de transacciones** en las órdenes de prueba.
  3. Si todo eso está bien y aún hay desvío, el siguiente paso sería revisar **solo la interpretación del motor** (qué estado/contrapartida usa para cada lookup), sin agregar parches ni dedupes en main.

No se propone por ahora ningún cambio en `cc_modelo_reglas_todas_combinaciones.sql` hasta no confirmar en Supabase que los datos difieren de ese script.

---

## 7. Resolución (marzo 2026)

- **Auditoría en Supabase:** las filas de Tx3 y Tx4 para ARS-ARS con intermediario tienen `cc_cliente_signo = 0` en la base; la fuente de verdad coincide con el script.
- **Transacciones por orden:** en prueba manual hubo exactamente 4 transacciones (sin duplicados lógicos).
- **Síntoma P,E,P,E (saldo 400k vs 200k):** el motor armaba **2 filas** CC cliente correctas; la RPC `sync_cc_caja_orden` fallaba al insertar la fila de comisión (`transaccion_numero` null). Corregido en **`sql/rpc_sync_cc_caja_orden.sql`** usando `->>` + `::integer` (ver comentario al inicio del archivo y `docs/TESTING_E2E_GUIA.md` §1.6).
- **E2E colgado en combinación 11 (E,E,E,P):** además de desplegar la RPC, se subieron timeouts del test (`test.setTimeout` 15 min y espera de “Actualizando estado…” 90 s); ver `docs/TESTING_E2E_GUIA.md` §1.7 y `docs/CONTEXTO_TEST_CC_COMBINACIONES.md`.
