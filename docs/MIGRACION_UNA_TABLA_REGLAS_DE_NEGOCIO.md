# Migración a **una sola tabla de verdad**: `reglas_de_negocio`

## Objetivo (plan acordado)

- **Una** tabla donde vivan las reglas de negocio que el sync traduce en movimientos de CC (y efectos coherentes de caja cuando corresponda).
- **Nombre canónico:** `public.reglas_de_negocio` (columnas `entidad_cc`, `monto_origen`, `linea`, `condicion_estado_comision`, etc.).
- **`cc_modelo_reglas`:** **ya no la lee el front** (`main.js`). Puede **eliminarse** en Supabase con backup previo: **`sql/migracion_drop_cc_modelo_reglas.sql`**. Scripts `sql/cc_modelo_reglas*.sql` quedan como **histórico** de migraciones (no son fuente de verdad operativa).

## Estado actual (resumido)

| Origen | Uso en `main.js` |
|--------|-------------------|
| `reglas_de_negocio` | Si hay ≥1 fila para `(tipo_operacion_codigo, usa_intermediario)` de la orden → **`aplicarMotorCcDesdeReglasDeNegocio`**. Sin filas → fallbacks legacy (transacciones + CHEQUE + cierre sintético dos monedas donde aplica). |
| `cc_modelo_reglas` | **Ninguno** (tabla opcional en DB hasta ejecutar el DROP). |

**Datos:** en `sql/reglas_de_negocio_tabla.sql` y migraciones puntuales ya se **eliminan** de `cc_modelo_reglas` varias claves (p. ej. USD-ARS / ARS-USD / USD-USD / CHEQUE-ARS en los casos canónicos). El tipo **ARS-ARS** ya **no** existe en el catálogo (cheque en pesos = **CHEQUE-ARS** en `reglas_de_negocio`). El bootstrap `sql/cc_modelo_reglas_tabla.sql` **no** inserta ARS-ARS; en bases viejas: `sql/migracion_cc_modelo_reglas_eliminar_ars_ars.sql`.

## Pasos para cerrar la migración (checklist)

1. **Inventario**  
   En Supabase:  
   `SELECT DISTINCT tipo_operacion_codigo, usa_intermediario FROM cc_modelo_reglas ORDER BY 1, 2;`  
   Cada combinación que siga apareciendo debe **tener equivalente** en `reglas_de_negocio` (mapeando filas cliente vs intermediario a `entidad_cc`).

2. **Migración SQL**  
   Por cada tipo pendiente: script `INSERT ... INTO reglas_de_negocio` (con `ON CONFLICT` alineado al `UNIQUE` de la tabla) + `DELETE FROM cc_modelo_reglas WHERE tipo_operacion_codigo = '…'` (cuando el motor nuevo esté verificado en staging).

3. **App (`main.js`)** — **hecho:** solo `getReglasDeNegocio`; motor si `reglas_de_negocio.length > 0`; sin `getReglasCcModelo` ni motor `cc_modelo_reglas`.

4. **Verificación**  
   - E2E: `npm run test:e2e-cc-activos-completo` (y tipos afectados por el script nuevo).  
   - Órdenes reales o de prueba por cada tipo migrado.

5. **Cierre de esquema**  
   - Ejecutar **`sql/migracion_drop_cc_modelo_reglas.sql`** en Supabase (tras backup y verificación de tipos activos con reglas).

## Referencias

- `docs/REGLAS_DE_NEGOCIO.md` — alcance y consumo en app.  
- `docs/CC_MODELO_TABLA_REGLAS.md` — semántica histórica de columnas del modelo viejo (útil para mapear a `reglas_de_negocio`).  
- `sql/reglas_de_negocio_tabla.sql` — DDL + limpieza parcial de `cc_modelo_reglas`.
