-- Migración: estados de orden a Pendiente Instrumentar / Instrumentación Parcial / Cerrada en Ejecución / Orden Ejecutada
-- Ejecutar después de supabase_complejidad_ordenes.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_estado_check') THEN
    ALTER TABLE public.ordenes DROP CONSTRAINT ordenes_estado_check;
  END IF;

  -- Mapear valores antiguos a los nuevos
  UPDATE public.ordenes SET estado = 'pendiente_instrumentar' WHERE estado = 'abierta';
  UPDATE public.ordenes SET estado = 'instrumentacion_parcial' WHERE estado = 'parcialmente_cerrada';
  UPDATE public.ordenes SET estado = 'orden_ejecutada' WHERE estado = 'cerrada';

  ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_estado_check
    CHECK (estado IN ('pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada'));
  ALTER TABLE public.ordenes ALTER COLUMN estado SET DEFAULT 'pendiente_instrumentar';
EXCEPTION
  WHEN duplicate_object THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_estado_check') THEN
      ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_estado_check
        CHECK (estado IN ('pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada'));
    END IF;
  WHEN OTHERS THEN RAISE;
END $$;

COMMENT ON COLUMN public.ordenes.estado IS 'pendiente_instrumentar = sin transacciones; instrumentacion_parcial = hay trx, no conciliada; instrumentacion_cerrada_ejecucion = conciliada, no todas ejecutadas; orden_ejecutada = todas ejecutadas.';
