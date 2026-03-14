-- Migración: modelo robusto orden → CC y caja derivados
-- 1) movimientos_caja: permitir orden_id junto con transaccion_id (origen por orden)
-- 2) Integridad: transacción debe pertenecer a la orden en mov_cc y mov_cc_int
-- Ejecutar en Supabase SQL Editor.

-- ========== 1. Caja: permitir orden_id + transaccion_id ==========================================
ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS chk_mov_caja_origen;

ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT chk_mov_caja_origen CHECK (
    (transaccion_id IS NOT NULL AND tipo_movimiento_id IS NULL) OR
    (orden_id IS NOT NULL AND tipo_movimiento_id IS NULL AND transaccion_id IS NULL) OR
    (orden_id IS NULL AND tipo_movimiento_id IS NOT NULL AND transaccion_id IS NULL)
  );
-- Así: flujo por orden puede tener transaccion_id y orden_id; legacy solo orden_id; manual solo tipo_movimiento_id.

COMMENT ON COLUMN public.movimientos_caja.orden_id IS 'Orden asociada. En flujo por transacciones se rellena junto con transaccion_id para borrar por orden en sincronización.';

-- Índice para borrar por orden en sync (si no existe)
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_orden ON public.movimientos_caja (orden_id);

-- Backfill: poner orden_id en movimientos_caja que tienen transaccion_id pero orden_id NULL
UPDATE public.movimientos_caja m
SET orden_id = i.orden_id
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
WHERE m.transaccion_id = t.id
  AND m.orden_id IS NULL
  AND m.transaccion_id IS NOT NULL;

-- ========== 2. Integridad: transacción debe pertenecer a la orden ================================
-- Función auxiliar: true si transaccion_id pertenece a orden_id (o alguno es null)
CREATE OR REPLACE FUNCTION public.transaccion_pertenece_a_orden(p_orden_id uuid, p_transaccion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (p_orden_id IS NULL OR p_transaccion_id IS NULL)
     OR EXISTS (
       SELECT 1 FROM public.transacciones t
       JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
       WHERE t.id = p_transaccion_id AND i.orden_id = p_orden_id
     );
$$;

-- CC cliente: check en INSERT/UPDATE
ALTER TABLE public.movimientos_cuenta_corriente
  DROP CONSTRAINT IF EXISTS chk_mov_cc_transaccion_orden;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD CONSTRAINT chk_mov_cc_transaccion_orden CHECK (
    public.transaccion_pertenece_a_orden(orden_id, transaccion_id)
  );

-- CC intermediario: mismo check
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  DROP CONSTRAINT IF EXISTS chk_mov_cc_int_transaccion_orden;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD CONSTRAINT chk_mov_cc_int_transaccion_orden CHECK (
    public.transaccion_pertenece_a_orden(orden_id, transaccion_id)
  );

COMMENT ON FUNCTION public.transaccion_pertenece_a_orden IS 'Usado por CHECK en mov_cc y mov_cc_int: la transacción debe ser de la instrumentación de la orden.';
