-- OBSOLETO para la política actual «cada transacción solo su pata en CC».
-- Este script insertaba líneas extra (incl. +mr en línea 2) para netear saldos entre transacciones cp_ic E,E.
-- Ya no deben reaplicarse esos INSERT. Para limpiar bases donde ya corrió:
--   sql/migracion_reglas_cc_int_transacciones_independientes_quitar_espejo_mr.sql
--
-- Si necesitás solo quitar la línea 1 duplicada que este archivo llegó a insertar (ARS/USD/EUR en egreso ejecutada true),
-- revisá el historial del repo antes de abril 2026; el canónico está en sql/reglas_de_negocio_tabla.sql.

SELECT 1 AS migracion_cp_ic_ee_neteo_obsoleta_no_op;
