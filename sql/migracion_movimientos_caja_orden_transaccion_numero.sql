-- Movimientos de caja: columnas orden_numero y transaccion_numero para vista estructurada y trazabilidad.
-- Una sola tabla acepta ambos orígenes: manual (tipo_movimiento_id) y acuerdos (transaccion_id + orden_id).
-- Ejecutar en Supabase SQL Editor después de migracion_transacciones_numero.sql.

-- Columnas de número interno (denormalizadas para listado sin JOIN)
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS orden_numero integer,
  ADD COLUMN IF NOT EXISTS transaccion_numero integer;

-- Backfill desde relaciones
UPDATE public.movimientos_caja m
SET orden_numero = o.numero
FROM public.ordenes o
WHERE m.orden_id = o.id AND m.orden_numero IS NULL AND m.orden_id IS NOT NULL;

UPDATE public.movimientos_caja m
SET transaccion_numero = t.numero
FROM public.transacciones t
WHERE m.transaccion_id = t.id AND m.transaccion_numero IS NULL AND m.transaccion_id IS NOT NULL;

COMMENT ON COLUMN public.movimientos_caja.orden_numero IS 'Número interno de la orden (ordenes.numero), para vista y filtros sin JOIN.';
COMMENT ON COLUMN public.movimientos_caja.transaccion_numero IS 'Número interno de la transacción (transacciones.numero), para vista y filtros sin JOIN.';

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_orden_numero ON public.movimientos_caja (orden_numero) WHERE orden_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_transaccion_numero ON public.movimientos_caja (transaccion_numero) WHERE transaccion_numero IS NOT NULL;
