# CC: cierre por operación — recorrido técnico y qué ajustar

Este documento une el **criterio de negocio** (parcial/total: lo cumplido debe reflejarse en CC sin posición fantasma; orden cerrada → saldo CC cliente–Pandy coherente con la realidad del acuerdo) con el **pipeline real** de la app y de Supabase, para trabajar cambios en **`reglas_de_negocio`** y en el motor **sin romper otros tipos**.

---

## 1. Principio de producto (recordatorio)

- **Parcial:** lo que el cliente **ya cumplió** en esa orden debe quedar **neteado en CC** en la medida de esa obligación; lo pendiente sigue visible.
- **Total:** si el cliente cumplió **todo** lo suyo y el acuerdo está cerrado como en operación real, **para esa orden** la posición CC cliente–Pandy debe ser la que corresponda (en el caso “todo cumplido sin deuda pactada”, **cero** en cada moneda relevante).

El motor actual no tiene un bloque único llamado “invariante por orden”; la coherencia surge de la **suma de movimientos** que disparan las **reglas** + condiciones de **contrapartida** en `main.js`. Si eso falla, la CC “miente” aunque la orden diga ejecutada.

Inventario explícito de **dónde** el sistema puede fallar ese criterio (tres vías de sync, exclusiones del motor, MC manual, RPC sin validación, etc.): **`docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`** (tres vías de sync y riesgos). **Neteo duro antes de persistir:** `sincronizarCcYCajaDesdeOrden` valida con `validarInvarianteNeteoCcClienteAcuerdoCerrado` y **no** invoca `sync_cc_caja_orden` si la CC del cliente del acuerdo no netea por moneda (motor, legacy y MC manual); la excepción en moneda recibida es el residual cubierto por leyendas **Pandy** o **Tercero** «cumple pata» — ver `INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md` §3.

---

## 2. Recorrido end-to-end (el reloj)

| Paso | Dónde | Qué hace |
|------|--------|----------|
| 1 | **Orden + `tipos_operacion`** | Define `codigo` (ej. `ARS-USD`), `usa_intermediario`, `moneda_in` / `moneda_out`, acuerdo **mr/me**. |
| 2 | **`instrumentacion` + `transacciones`** | Cada fila: `tipo`, `pagador`, `cobrador`, `moneda`, `monto`, `estado`, opcional `pagador_cliente_id` / `cobrador_cliente_id`. El motor usa **los strings** `pagador` y `cobrador` tal cual vienen en la fila (p. ej. `cliente`, `pandy`, `intermediario`). |
| 3 | **`sincronizarCcYCajaDesdeOrden`** (`main.js`) | Carga orden, tipo, transacciones, `comisiones_orden`, reglas vía **`getReglasDeNegocio(codigo, usaIntermediario)`** (y a veces reglas auxiliares para comisión int. en cruces TC). Si hay filas → **`usarMotorEfectivo`** y **no** corre el cierre sintético legacy dos monedas (ver comentario ~L19258: con motor, el cierre duplicado rompería saldos). |
| 4 | **`aplicarMotorCcDesdeReglasDeNegocio`** | Por cada transacción ejecutada (salvo exclusiones): calcula **`contrapartidaEjecutada(...)`**, hace **`lookupReglasDeNegocio`** con **(codigo, pag, cob, tipo, es_comision, estado, contrapartida)** y emite movimientos CC cliente/intermediario según `entidad_cc`, `signo`, `monto_origen`, `linea`. |
| 5 | **`contrapartidaEjecutada`** (`main.js` ~8354) | Grafo **fijo** de pares (ej. ingreso C→I ↔ egreso P→C; egreso I→C ↔ ingreso C→P; ingreso C→P ↔ egreso P/I→C). **No** conoce “tercer cliente” ni cobradores fuera de `pandy` / `intermediario` salvo el fallback genérico (otro tipo ↔ intercambia pag/cob). |
| 6 | **Helpers de “par cliente cerrado”** | Ej. **`ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado`**, **`egresoEntregaAClienteEjecutado`**: solo consideran cobrador/pagador **`pandy`** o **`intermediario`**. |
| 7 | **Persistencia** | Se borran movimientos CC/caja de la orden y se insertan los armados; RPC/sync según política actual. |

**Conclusión:** la CC es correcta solo si (a) las **transacciones** encajan con las **claves** de la tabla `reglas_de_negocio`, y (b) **`contrapartidaEjecutada`** y los helpers reflejan **el mismo** flujo operativo que la mesa usa.

---

## 3. Por qué un caso “real” puede mostrar −5M ARS con orden ejecutada

Escenario típico (ej. prueba Charly / orden 4):

- Acuerdo **ARS-USD** con intermediario (**cp_ic** canónico en doc): ingreso **Cliente→Pandy** (ARS) + egreso **Intermediario→Cliente** (USD).
- Si en instrumentación el ingreso quedó como **Cliente→[cobrador que no es `pandy` ni `intermediario`]** (p. ej. otro actor modelado como **cliente** con nombre “Madero”, o rol distinto en BD):

  1. **`lookupReglasDeNegocio`** busca filas con **exactamente** esos `pagador`/`cobrador`. La matriz canónica **ARS-USD + int** (`sql/reglas_de_negocio_tabla.sql`, bloques `ci_pc` / `cp_ic`) usa **`cliente`+`pandy`**, **`cliente`+`intermediario`**, **`pandy`+`cliente`**, **`intermediario`+`cliente`** — no suele tener **`cliente`+`cliente`** para ese tipo.
  2. Puede **no matchear** la primera transacción → CC incompleta, **o** matchear otra rama/legacy y quedar **una pata sin neteo**.
  3. **`ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado`** devuelve **false** si el cobrador no es `pandy` ni `intermediario` → comisiones / flags que dependen de “par cerrado” se comportan mal.
  4. **`contrapartidaEjecutada`** para ingreso **C→Pandy** busca egreso **P/I→Cliente**. Si el ingreso **no** está guardado como C→Pandy, el encadenamiento no coincide con lo que la regla asume.

En paralelo, el **egreso USD** (Int→Cliente) suele matchear reglas `compromiso_pago` con **par ±** que **netea en USD**, mientras el **ingreso ARS** (C→Pandy) con `contrapartida_ejecutada = true` solo tenía **una** línea en ARS → **ARS no neteaba** y la CC mostraba posición incorrecta aunque `pagador`/`cobrador` fueran canónicos. **Corrección en matriz:** segunda línea en el ingreso (`linea = 1`, `signo` opuesto), ver **`sql/migracion_reglas_cp_ic_ingreso_ee_par_moneda_recibida.sql`** y `docs/REG_NEG_ARS_USD_INT_PASO1.md`.

**No es “un bug de color”:** puede ser desalineación **instrumentación ↔ reglas** o un **hueco de la matriz** (cp_ic E,E) aunque la instrumentación sea correcta.

---

## 4. Qué tocar (orden recomendado, sin romper el reloj)

### A) Verdad de campo (siempre primero)

1. Para la orden problemática, en Supabase: **`transacciones`** de esa `instrumentacion_id` — anotar **`pagador`, `cobrador`, `moneda`, `monto`, `estado`** de cada fila.
2. Comparar con **`docs/REG_NEG_ARS_USD_INT_PASO1.md`** (patrones **ci_pc** vs **cp_ic**) y con las filas de **`reglas_de_negocio`** para **`ARS-USD`**, `usa_intermediario = true`.

Si el cobrador del ingreso ARS **no** es `pandy` ni `intermediario`, tenés dos caminos de producto:

- **Operativo:** corregir instrumentación / wizard para que el cobro de ARS del cliente sea **Cliente→Pandy** o **Cliente→Intermediario** según el patrón elegido (alineado a reglas ya desplegadas).
- **Modelo:** ampliar **`reglas_de_negocio`** (+ migración) para la combinación real (`pagador`/`cobrador` que usen) **y** extender **`contrapartidaEjecutada`** / helpers si hace falta que el “cierre” reconozca ese par — **siempre** revisando CC intermediario y E2E (`tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js`, esperados en `cc-intermediario-inversa-esperado.js`).

### B) Reglas en SQL (fuente de verdad)

- Canónico: **`sql/reglas_de_negocio_tabla.sql`** y scripts citados en **`docs/REGLAS_DE_NEGOCIO.md`**.
- Cualquier fila nueva: respetar **`linea`**, **`contrapartida_ejecutada`**, **`monto_origen`** (mr/me/monto_transacción/prorrateos) como en el resto de la matriz.
- Tras cambiar reglas: **resincronizar** órdenes afectadas (`sincronizarCcYCajaDesdeOrden` / flujo app).

### C) Motor (`main.js`) — solo si el modelo tabular no alcanza

La **Regla de oro** del proyecto: no parchear saldos en el front; si hace falta nueva semántica (ej. tratar cierto tercero como equivalente a `pandy` solo para **contrapartida**), documentar y tocar **`contrapartidaEjecutada`** / lookup de forma **genérica** y cubierta por tests.

### D) Cierre sintético dos monedas (legacy)

Solo corre cuando **no** hay motor de reglas (`!usarMotorEfectivo`). **No** es la solución para ARS-USD+int con reglas cargadas: duplicaría líneas. El arreglo del caso “reloj” pasa por **A+B** (y C solo si ampliás el modelo).

### E) Tests y expectativas

- Antes de cambiar números esperados en E2E: acuerdo explícito (regla estricta del proyecto).
- Ideal: agregar combinación que reproduzca **tu** instrumentación (mismos `pagador`/`cobrador`) para no regresar.

---

## 5. Referencias cruzadas

- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md` — principios CC/caja y regla de oro.
- `docs/REGLAS_DE_NEGOCIO.md` — tabla única y monto_origen.
- `docs/REG_NEG_ARS_USD_INT_PASO1.md` — ARS-USD con intermediario (ci_pc / cp_ic).
- `docs/FLUJOS_CC_REGLA.md`, `docs/REGLA_CC_SIMPLE_INFALIBLE.md` — coherencia de saldos.
- `main.js` — `sincronizarCcYCajaDesdeOrden`, `aplicarMotorCcDesdeReglasDeNegocio`, `contrapartidaEjecutada`, `lookupReglasDeNegocio`.

---

## 6. Resumen operativo (una línea)

**Para que la CC sea un reloj:** cada transacción ejecutada de la orden debe **matchear** filas de `reglas_de_negocio` cuyas claves `(pagador, cobrador, …)` sean las **mismas** que en BD, y **`contrapartidaEjecutada`** debe reconocer el **mismo** encadenamiento operativo; si el cobrador del ingreso no es el que la matriz prevé, o bien se **corrige la instrumentación**, o se **amplía matriz + grafo** con tests y revisión de CC intermediario.
