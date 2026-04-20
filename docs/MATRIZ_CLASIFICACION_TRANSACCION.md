# Matriz: `clasificacion_transaccion` (transacciones → ENUM)

**Estado (2026-04-17):** matriz de producto **aprobada** para el grueso actual (`CC_FLUJO_OPERATIVO_TRX` donde corresponde); continuidad en `docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md` § **Checkpoint de continuidad**. Evitar `npm run excel:matriz-clasificacion-trx` si el `.xlsx` ya está curado a mano.

**Excel:** `docs/MATRIZ_CLASIFICACION_TRANSACCION.xlsx`

### Qué significa **S** y **N** (hoja Matriz)

- Cada **fila** es un **contexto** (tipo de operación + usa intermediario, o un flujo de la app).
- Cada **columna** con nombre de ENUM es un **valor posible** para la columna de base `transacciones.clasificacion_transaccion`.

**S** en la celda (fila × columna ENUM):

> “Para este contexto, cuando se guarda la transacción, el valor que debe persistir en Postgres en `clasificacion_transaccion` es **exactamente** el ENUM de esta columna.”

**N**:

> “Para este contexto **no** corresponde guardar la transacción con ese ENUM.”  
> No es un error: solo indica “no es este valor”.

**Regla:** en cada fila, cuando cierres criterio, debería haber **una sola S** entre todas las columnas ENUM (una sola clasificación por contexto). Las demás columnas ENUM de esa fila quedan en **N**.

**Ejemplo:** solo **S** bajo `CC_FLUJO_OPERATIVO_TRX` y **N** en el resto = “toda transacción de ese contexto se guarda con `clasificacion_transaccion = CC_FLUJO_OPERATIVO_TRX`”.

---

**Regenerar** (sobrescribe el archivo):

```bash
npm run excel:matriz-clasificacion-trx
```

La hoja **Leyenda** del Excel repite esto en castellano. Plan: `docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md` § ítem 2.
