# Contexto: tabla legacy `cc_modelo_reglas`

Los scripts en **`sql/`** con prefijo **`cc_modelo_reglas`** o **`migracion_cc_modelo_reglas`** corresponden al modelo CC **antes** de unificar la fuente de verdad en **`reglas_de_negocio`**.

- **La app (`main.js`) ya no consulta `cc_modelo_reglas`.**
- Para eliminar la tabla en Supabase (tras backup): **`sql/migracion_drop_cc_modelo_reglas.sql`**.
- Esos `.sql` se mantienen en el repo como **histórico / migraciones** hasta decidir si se mueven físicamente a esta carpeta `archive/`.

## Snapshot en JSON (backup sin `pg_dump`)

Export puntual de **`cc_modelo_reglas`** en Supabase (67 filas, tipos ARS-USD / USD-ARS / ARS-ARS con intermediario), guardado antes de dropear la tabla:

- **`snapshots/cc_modelo_reglas_supabase_export_2026-03-21.json`**

Ver también `snapshots/README.md`.
