-- Añadir estado 'anulada' a órdenes (anulación de orden)
-- Ejecutar en Supabase SQL Editor

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_estado_check') THEN
    ALTER TABLE public.ordenes DROP CONSTRAINT ordenes_estado_check;
  END IF;

  ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_estado_check
    CHECK (estado IN ('pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'));
EXCEPTION
  WHEN OTHERS THEN RAISE;
END $$;

COMMENT ON COLUMN public.ordenes.estado IS 'Incluye anulada = orden anulada por el usuario.';
