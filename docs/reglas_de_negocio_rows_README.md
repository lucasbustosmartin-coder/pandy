# Snapshot `reglas_de_negocio_rows.sql`

Archivo **volcado puntual** de `public.reglas_de_negocio` (INSERT generado desde la base). **No** es la fuente canónica de verdad del repo: esa sigue siendo `sql/reglas_de_negocio_tabla.sql` y las migraciones en `sql/`.

## Revisión integral (última pasada)

Ver **`docs/REVISION_EXHAUSTIVA_REGLAS_Y_TIPOS_OPERACION.md`**: conteos por código×intermediario, por qué **ARS-USD+int (20)** y **USD-ARS+int (12)** difieren en tu dump frente al canónico (20/20), y cómo eso explica **EUR-USD (20) vs USD-EUR (12)**.

Para cruzar con el catálogo de tipos, exportar también `tipos_operacion`: **`docs/tipos_operacion_rows_README.md`**.

## Revisión EUR-USD / USD-EUR (+ intermediario)

En el snapshot analizado:

- **USD-EUR** + int: **12** filas; **EUR-USD** + int: **20** filas → mezcla de plantillas (equivalente a tener **USD-ARS** con menos filas que **ARS-USD** en la misma base).
- En ambos códigos EUR aparecían filas con **`moneda = ARS`**, heredadas al replicar desde USD-ARS/ARS-USD **sin** sustituir ARS por EUR.

Detalle y pasos recomendados: **`docs/REGLAS_CRUCE_INVERSO_CONSISTENCIA.md`** y **`sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`**.

Tras corregir la base, regenerar este snapshot si lo usás como referencia documental.
