# Fuente de verdad CC: tabla + multi‑pata / multi‑modalidad

Este documento **rearma** el modelo mental que pedís (entradas/salidas reales por moneda y por medio) y lo conecta con **`cc_modelo_reglas`** y con el **motor en `main.js`**, con el objetivo de **minimizar excepciones en código** y dejar la verdad en la matriz SQL.

Referencias: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/CC_MODELO_ENGINE_TABLA.md`, `docs/REGLA_CC_SIMPLE_INFALIBLE.md`.

---

## 1. Principio operativo (tu concepto)

1. **Cada movimiento en CC es una entrada o salida de dinero** (comprometida o ejecutada) en **una** moneda, entre roles claros (cliente, Pandy, intermediario).
2. **Una orden puede tener varias “patas” instrumentadas**: no mezclar en una sola transacción “2,5M efectivo + 2,5M transferencia + TC”. En la app, eso se modela como **varias transacciones** (misma orden, distinto `numero`, mismo tipo de cambio del acuerdo), cada una con **su** `pagador`, `cobrador`, `moneda`, `monto`, `estado`.
3. **Par lógico**: en cada momento, lo que el cliente “debe” o “pagó” se ve como **suma algebraica** de las filas CC de esas transacciones (más comisiones cuando la tabla lo diga).
4. **Al ejecutar solo una transacción** se confirma **solo** el movimiento que corresponde a esa pata; el saldo por moneda queda como **suma de movimientos no anulados**. El **detalle** del modal puede filtrar por `incluir_en_detalle` (ver §5).

**Ejemplo ARS‑USD (esquema conceptual)**  
Cliente entrega 5.000.000 ARS en dos medios (2,5M + 2,5M) y Pandy se compromete a 5.000 USD (TC 1000):

| Instrumentación | Rol | Moneda | Monto | Estado inicial |
|-----------------|-----|--------|-------|----------------|
| Tx1 | Cliente → Pandy (o → Int.) | ARS | 2.500.000 | pendiente |
| Tx2 | Cliente → … | ARS | 2.500.000 | pendiente |
| Tx3 | Pandy → Cliente | USD | 5.000 | pendiente |

Los **compromisos** pendientes generan filas CC según `cc_modelo_reglas` (estado `pendiente`, `contrapartida_ejecutada` según la otra pata). **Si solo ejecutás Tx1**, en CC debería impactar **solo** la fila asociada a Tx1 (p. ej. −2.500.000 ARS en la convención vigente), y el saldo ARS refleja “falta cerrar” el resto de patas.

> La app ya soporta “una transacción = una moneda”; el **secreto** para multi‑modalidad es **desdoblar instrumentación**, no agregar lógica especial en el motor por “medio de pago”.

---

## 2. Tabla de verdad (`cc_modelo_reglas`) — dimensiones

Cada fila responde: *para este **tipo de orden** y **usa_intermediario**, ante una **transacción** con este **pagador/cobrador/tipo**, **¿es comisión?**, en este **estado** y con esta **contrapartida**, ¿qué hago en CC?*

| Dimensión | Rol |
|-----------|-----|
| `tipo_operacion_codigo` + `usa_intermediario` | Aisla la matriz (ARS‑USD con int. ≠ sin int.) |
| `pagador`, `cobrador`, `tipo_transaccion` | Identifica la pata |
| `es_comision` | Separa líneas de comisión explícita |
| `estado_transaccion` | `pendiente` / `ejecutada` |
| `contrapartida_ejecutada` | La otra pata del par cliente↔Pandy (o la simétrica definida en motor) ya ejecutada |
| `linea_motor` | Varias filas → varios movimientos CC para **la misma** transacción sin `if` por código en el front |
| `cc_cliente_*` / `cc_intermediario_*` | Signo, suma al saldo, incluir en detalle, moneda/monto de exposición (`orden_recibida`, `mr`, `me`, …) |

**Regla de oro:** si el comportamiento depende de “esta combinación de transacciones de la orden”, debe poder expresarse como **más filas** (distinto `contrapartida_ejecutada` / `estado_transaccion` / `linea_motor`) o documentarse como deuda técnica hasta migrar a tabla.

---

## 3. Espejos y flags en `main.js` (histórico)

**Actual:** el saldo no usa filas “solo explicativas” en DB: **no** existe columna `sumar_al_saldo` en movimientos; lo que se persiste debe ser **coherente** con la suma por moneda. El motor **aplica** filas de `cc_modelo_reglas` / `reglas_de_negocio`; el **merge** de lookups `contrapartida` false + true para USD‑ARS sin int. E,E sigue en **`motor_merge_lookup_contrapartida`** y **`motor_suprime_espejo_egreso_mr`** donde aplique.

Antes existía un bloque genérico de **espejos** con líneas que no sumaban al saldo; se **eliminó** para alinear con “saldo = suma de movimientos”. Las **omisiones** de espejos duplicados deben quedar en **tabla** (`motor_suprime_espejo_*`, etc.).

---

## 4. Plan para minimizar código (sin romper producción de un golpe)

### Fase A — Congelar semántica (ya)

- Matriz canónica en `sql/cc_modelo_reglas_todas_combinaciones.sql` + migraciones puntuales.
- Tests E2E 01/02/03 como red de seguridad.

### Fase B — Columnas en `cc_modelo_reglas` (en curso)

| Columna | Estado | Uso |
|---------|--------|-----|
| `motor_suprime_espejo_egreso_mr` | **Implementado (USD‑ARS sin int)** | Si true en alguna fila matcheada del egreso: no generar espejo automático en `mr` para egreso P→C; la tabla ya cerró exposición (p. ej. `linea_motor` 1 −mr USD). |
| `motor_merge_lookup_contrapartida` | **Implementado (USD‑ARS sin int)** | Si true en el set de reglas del tipo: en egreso P→C ejecutado con par cliente cerrado, unir lookups `contrapartida` false y true por `linea_motor`. |
| `motor_suprime_espejo_ingreso_tx` | Pendiente | Opcional: suprimir espejo en moneda de la transacción en ingresos (si hace falta bajar más lógica a tabla). |

Scripts: `sql/migracion_cc_modelo_reglas_motor_espejo_merge.sql`; §0 y UPDATE en `sql/cc_modelo_reglas_todas_combinaciones.sql`. El motor en `main.js` lee las columnas con **fallback** al comportamiento anterior si Supabase aún no tiene la migración (`ccModeloReglasTieneColumna`).

### Cierre fase USD‑ARS sin intermediario

1. En Supabase: **`sql/migracion_cc_modelo_reglas_motor_espejo_merge.sql`** (o reaplicar **`sql/cc_modelo_reglas_todas_combinaciones.sql`**, que incluye §0 con estas columnas y los `UPDATE`).
2. Tests: **`npm run test:e2e-cc-usd-ars-sin-int`** (solo las 4 combinaciones de USD‑ARS en el spec 02).
3. **Siguiente tipo:** USD‑ARS con intermediario / ARS‑USD con int (`omitirEspejo*` restantes en `main.js`).

### Fase C — Motor genérico

1. Tras aplicar todas las `reglasTx`, calcular `suprimirIngresoTx` / `suprimirEgresoMr` con OR de las filas matcheadas (o de la fila “principal” `linea_motor` mínima con signo ≠ 0).
2. Sustituir los tres `omitirEspejo*` por lectura de esos booleanos desde la fila activa del lookup.
3. Sustituir el merge USD‑ARS por `motor_merge_contrapartidas` en la fila egreso ejecutada (o en metadata por tipo en una tabla auxiliar mínima si no querés repetir en cada fila).

### Fase D — Multi‑pata ARS (efectivo + banco)

- **Solo producto**: plantillas de instrumentación o asistente “Dividir cobro ARS” que cree N transacciones Cliente→… con el mismo acuerdo.
- **CC**: sin cambios en el motor si cada transacción tiene su fila en `cc_modelo_reglas`.

---

## 5. Saldo vs lista de movimientos (consistencia)

- **Saldo resumen** = **suma algebraica por moneda** de lo persistido en CC (excluye **anulado**). `incluir_en_detalle` solo controla **qué** aparece en el **modal detalle** del resumen, no altera el saldo.

`docs/REGLA_CC_SIMPLE_INFALIBLE.md` en §2–3 enfatiza “solo ejecutadas”; el modelo extendido con **compromisos pendientes en CC** es coherente si se documenta como **evolución**: pendientes generan filas con `estado` movimiento `pendiente`.

---

## 6. Checklist al tocar la matriz

- [ ] ¿Cliente e intermediario actualizados a la par?
- [ ] ¿Cada combinación P,E / E,P / E,E tiene filas `linea_motor` sin depender de espejos duplicados?
- [ ] ¿E2E 02 (tipos 2 tx) y 03 (inversa) pasan tras cambios SQL + sync?
- [ ] ¿Se actualiza `docs/CC_MODELO_ENGINE_TABLA.md` si cambia el contrato del motor?

---

## 7. Resumen en una frase

**Instrumentá cada pata económica como transacción propia; la tabla de verdad define signo, moneda, saldo y detalle por pata y estado; el motor solo aplica filas y, a mediano plazo, lee de la tabla cuándo suprimir espejos automáticos en lugar de `if (codigoOrden === …)`.**
