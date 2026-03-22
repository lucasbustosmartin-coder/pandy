-- OBSOLETO: el modelo P,E USD-USD sin int ya no usa espejo +mr en ingreso pendiente ni una sola fila −me en egreso ejecutado.
-- Usar en su lugar: `sql/migracion_reglas_usd_usd_sin_int.sql` (DELETE línea ingreso pendiente 1 + ingreso pendiente signo +1 + egreso ejecutada false líneas 0/−1 y 1/+1).
-- Este archivo se mantiene solo como referencia histórica; no ejecutar sobre bases ya migradas con `migracion_reglas_usd_usd_sin_int.sql`.

SELECT 1;
