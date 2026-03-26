# Snapshot `reglas_de_negocio_rows.sql` / `reglas_de_negocio_rows (2).sql` / CSV

## CSV (`docs/reglas_de_negocio_rows (1).csv`)

- **Ubicación en el repo:** `docs/reglas_de_negocio_rows (1).csv` (export tabular; columnas lógicas de la tabla, sin `id` ni timestamps).
- **Dos usos habituales:**
  1. **Volcado desde Supabase** (Table Editor → Export CSV): guardalo con ese nombre en `docs/` para comparar con el canónico o adjuntarlo en revisiones.
  2. **Regenerado desde el SQL del repo:** `node scripts/reglas-negocio-tabla-a-csv.js` vuelve a armar el CSV a partir de `sql/reglas_de_negocio_tabla.sql` (útil tras cambios en la matriz del repo).

Si el archivo en `docs/` es el generado por el script, tendrá el mismo contenido que los `INSERT` del canónico; si lo reemplazás por un export real de producción, el diff frente al script o frente a `reglas_de_negocio_rows (2).sql` muestra el desvío operativo.

---

Archivo **volcado puntual** de `public.reglas_de_negocio` (INSERT generado desde la base). **No** es la fuente canónica de verdad del repo: esa sigue siendo `sql/reglas_de_negocio_tabla.sql` y las migraciones en `sql/`.

**En Supabase:** no ejecutes el `.sql` del dump tal cual (IDs fijos y riesgo de duplicados). **Solo** ejecutá, de punta a punta, **`sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql`**: incluye parche cp_ic, comisión USD-USD+int, ci_pc (paso 2b) y regeneración **EUR-USD, USD-EUR, EUR-ARS, ARS-EUR** con `usa_intermediario = true` desde USD-ARS+int y ARS-USD+int de la misma base.

## Revisión integral (última pasada)

Ver **`docs/REVISION_EXHAUSTIVA_REGLAS_Y_TIPOS_OPERACION.md`**: conteos por código×intermediario, por qué **ARS-USD+int (20)** y **USD-ARS+int (12)** difieren en tu dump frente al canónico (20/20), y cómo eso explica **EUR-USD (20) vs USD-EUR (12)**.

Para cruzar con el catálogo de tipos, exportar también `tipos_operacion`: **`docs/tipos_operacion_rows_README.md`**.

## Revisión EUR-USD / USD-EUR (+ intermediario)

En el snapshot analizado:

- **USD-EUR** + int: **12** filas; **EUR-USD** + int: **20** filas → mezcla de plantillas (equivalente a tener **USD-ARS** con menos filas que **ARS-USD** en la misma base).
- En ambos códigos EUR aparecían filas con **`moneda = ARS`**, heredadas al replicar desde USD-ARS/ARS-USD **sin** sustituir ARS por EUR.

Detalle y pasos recomendados: **`docs/REGLAS_CRUCE_INVERSO_CONSISTENCIA.md`** y **`sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`**.

Tras corregir la base, regenerar este snapshot si lo usás como referencia documental.
