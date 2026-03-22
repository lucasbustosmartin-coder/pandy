# Snapshot `tipos_operacion` (opcional)

Para revisar **junto** con `docs/reglas_de_negocio_rows.sql` que exista un tipo activo por cada `tipo_operacion_codigo` que aparece en reglas, conviene tener un volcado de **`public.tipos_operacion`**.

## Cómo generar `docs/tipos_operacion_rows.sql`

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
