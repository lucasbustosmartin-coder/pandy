# Snapshot `tipos_operacion` (opcional)

Para revisar **junto** con `docs/reglas_de_negocio_rows.sql` que exista un tipo activo por cada `tipo_operacion_codigo` que aparece en reglas, conviene tener un volcado de **`public.tipos_operacion`**.

## Archivo en el repo: `docs/tipos_operacion_rows.csv`

En el proyecto suele guardarse un export en **CSV** (`docs/tipos_operacion_rows.csv`) con columnas `id`, `codigo`, `nombre`, `activo`, `created_at`, `moneda_in`, `moneda_out`, `usa_intermediario`, `icono_modo`, `icono_url_publica`, `orden_visual`.

Para generar SQL que **borre y repueble** `tipos_operacion` con esas filas (mismos `id`):

```bash
npm run sql:seed:tipos-operacion
```

Eso escribe **`sql/seed_tipos_operacion_from_docs_csv.sql`**. Ejecutalo en el SQL Editor solo en bases **sin órdenes** que referencien `tipo_operacion_id`, o tras limpiar FKs. El bootstrap dev ya incluye **`sql/migracion_tipos_operacion_unique_solo_uq.sql`** (unicidad `codigo` + `usa_intermediario`). Detalle: `docs/PANDY_DEV_SUPABASE.md`.

## Cómo generar `docs/tipos_operacion_rows.sql` (alternativa pg_dump)

En **Supabase** → **SQL Editor**, por ejemplo:

```sql
-- Solo referencia: ajustar según tu herramienta de export.
-- Table Editor permite "Export as SQL" si está disponible en tu plan,
-- o usar pgAdmin / `pg_dump` contra la base.
```

Pasos típicos:

1. Dashboard → **Table Editor** → `tipos_operacion` → exportar datos (CSV o SQL si existe).  
2. O desde cliente local con cadena de conexión:  
   `pg_dump --data-only --table=public.tipos_operacion ... > docs/tipos_operacion_rows.sql`

Guardar el archivo en **`docs/tipos_operacion_rows.sql`** y mencionarlo en commits cuando hagas auditorías de reglas.

**Columnas útiles para cruzar con reglas:** `codigo`, `usa_intermediario`, `moneda_in`, `moneda_out`, `activo`, `orden_visual`.
