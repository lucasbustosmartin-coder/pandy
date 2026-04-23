# Borrador — CC: composición estable vs ciclo de estados

**Estado del documento:** borrador para discusión con cliente y equipo. **No** constituye especificación cerrada de implementación hasta acuerdo explícito de producto.

**Fecha:** 2026-04-21.

---

## Vínculo con la matriz Excel

Este borrador está pensado para usarse **junto** al Excel generado desde el repo (misma fuente que la auditoría de reglas en Supabase).

| Recurso | Ruta / comando |
|--------|----------------|
| Guía de generación y contenido del archivo | `docs/MATRIZ_CC_REGLAS_EXCEL.md` |
| Artefacto por defecto | `docs/MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx` |
| Regenerar tras cambios en BD o en la matriz embebida | `npm run excel:matriz-cc-reglas` |
| Filas **Matriz** (tipo×combinación + `[main]`) | `scripts/matriz-cc-combinaciones-activas.js` |
| Export (hojas Leyenda, Reglas, etc.) | `scripts/export-matriz-cc-reglas-excel.js` |

### Cómo usar el Excel para este tema

1. **Regenerar** el `.xlsx` contra el proyecto Supabase que quieran auditar (dev o prod), para que **Reglas_de_negocio** refleje la verdad cargada.
2. En la hoja **Matriz**, cada fila resume **signos y patas** por combinación (P,P, E,P, …) y ramas de **main.js**; las columnas **Nivel certeza** y **Como verificar** indican **cómo reproducir** o contrastar con código (útil en reunión con el cliente).
3. En la hoja **Reglas_de_negocio**, filtrar por `tipo_operacion_codigo` y `usa_intermediario` y ordenar por `estado_transaccion`, `contrapartida_ejecutada`, `linea`: ahí se ve si el modelo actual **multiplica recetas** según el avance de la orden (composición que **cambia** con el ciclo).
4. **Resumen_por_tipo** ayuda a priorizar tipos con muchas filas o sin cobertura clara entre tablas.

---

## Constatar el problema (lenguaje de negocio)

En varios tipos de operación la **lista efectiva** de movimientos de cuenta corriente (cliente y/o intermediario) **no es la misma** al instrumentar o con patas pendientes que cuando la orden está **totalmente ejecutada**: no solo cambian montos o leyendas, sino que a veces **entran o salen** líneas, o se usan **pares ±** que recién aparecen en ciertos estados. Eso dificulta que el cliente **lea** de un solo vistazo los **pendientes** como parte de una misma “foto” coherente del cierre.

La **caja** sigue siendo distinta: solo debe moverse con transacciones **ejecutadas** (`docs/CUENTA_CORRIENTE_Y_CAJA.md`). El pedido aquí es solo sobre **composición y lectura de CC**, sin confundir con efectivo.

---

## Modelo de referencia acordado (nueva regla MonR / MonE)

En `docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md` (§1.2.1 y contexto) el criterio explícito es que, para las patas MonE del patrón, **lo único que cambie** entre transacción pendiente y ejecutada sea el **estado** alineado a la trx y el texto **pendiente / ejecutado** en el concepto — la **lógica de patas** y el conjunto de movimientos relevantes se plantea **desde el inicio**. Ese documento es la **referencia de producto** para el objetivo “composición equivalente al cierre, persistiendo el estado real”.

---

## Objetivo propuesto (para cerrar con el cliente)

- **Composición canónica:** para cada tipo de operación (y variante con/sin intermediario que aplique), definir el conjunto de **líneas CC lógicas** que deberían existir **a lo largo de todo el ciclo**, alineadas a lo que hoy sería el caso **orden totalmente ejecutada** (salvo excepciones explícitas).
- **Estado real:** pendiente vs ejecutada (y anulación) debe reflejarse en **estado de trx**, **conceptos** y/o **atributos de movimiento**, sin **rearmar** el multiset de filas en cada transición de forma que el cliente pierda continuidad visual.
- **Saldos y pendientes:** el resumen que ve el cliente debe poder explicarse como suma de las **mismas** líneas canónicas, diferenciando lo pendiente de lo ejecutado según reglas de agregación acordadas.
- **Excepciones nombradas:** p. ej. CHEQUE-ARS, multicontraparte manual, movimientos manuales, legados documentados — cada una o entra en el mismo marco o queda como **submodelo** explícito en el contrato.

---

## Fases sugeridas (checklist de trabajo)

| Fase | Qué hacer |
|------|-----------|
| **0 — Producto** | Acordar definición de “composición fija”, cómo se muestran pendientes en saldo, excepciones. |
| **1 — Inventario** | Por tipo (`Tipos_operacion` + `usa_intermediario`): contrastar filas en **Reglas_de_negocio** por todas las claves de estado vs descripción en **Matriz**; listar ramas `[main]` que alteran composición (`Como verificar`). |
| **2 — Diseño** | Decidir estrategia (evolutiva en motor + SQL vs capa canónica); convención para líneas “aún no activas” (monto cero vs no sumar a saldo, etc.). |
| **3 — Implementación** | Por tipo o por familia (cruces, USD-USD, int, …): alinear motor `main.js` + migraciones `sql/` + E2E. |
| **4 — UI** | Resúmenes y detalle usan el mismo conjunto de líneas; leyendas pendiente/ejecutado. |
| **5 — Rollout** | Similar a rollout nueva regla: IN por tipo, re-sync, auditoría antes/después. |

---

## Riesgos y límites (honestidad operativa)

- Hoy **`reglas_de_negocio`** modela muchos casos con **filas distintas** según `estado_transaccion` y `contrapartida_ejecutada` (ver `docs/REGLAS_DE_NEGOCIO.md`, `docs/USD_USD_SIN_INTERMEDIARIO.md`, `docs/USD_USD_CON_INTERMEDIARIO.md`). Unificar al modelo “solo estados” implica **rediseño** de recetas y/o de lógica en `main.js`, no solo cosmética.
- Los **neteos** que hoy se logran con **pares ±** en una sola trx al ejecutar deben reexpresarse sin romper invariantes de saldo ya cubiertos por tests (`npm run test:unit-cc-*`, E2E en `docs/MATRIZ_CC_REGLAS_EXCEL.md`).
- **Re-sync** masivo altera filas persistidas; conviene plan de backup y diff (lecciones en `docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md` §8).

---

## Próxima actualización de este borrador

- Pasar a versión “propuesta acordada” cuando el cliente fije el contrato de composición fija.
- Añadir tabla por **tipo_operacion_codigo** (pendiente vs inventario) cuando exista el inventario de Fase 1.
- Mantener el **enlace bidireccional** con `docs/MATRIZ_CC_REGLAS_EXCEL.md` si se renombra o mueve el Excel guía.
