-- Fase 1.3 (plan performance CC): índice para filtros por orden en CC cliente.
-- sync_cc_caja_orden (upsert, DELETE huérfanos) y otras lecturas usan WHERE orden_id = $1.
-- En Pandy-Dev, EXPLAIN (ANALYZE) sobre COUNT(*) con ese filtro mostraba Seq Scan recorriendo
-- todas las filas de la tabla (~126 en el momento de la medición) sin índice en orden_id.

CREATE INDEX IF NOT EXISTS idx_mov_cc_orden_id
  ON public.movimientos_cuenta_corriente (orden_id)
  WHERE orden_id IS NOT NULL;

COMMENT ON INDEX public.idx_mov_cc_orden_id IS
  'CC cliente por orden (sync_cc_caja_orden y listados). Plan performance CC §1.3.';
