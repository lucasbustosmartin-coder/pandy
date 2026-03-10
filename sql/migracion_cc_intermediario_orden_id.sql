-- Añadir orden_id a movimientos_cuenta_corriente_intermediario para poder vincular
-- movimientos de "Conversión por tipo de cambio" (saldar CC intermediario por orden ejecutada).
-- Ejecutar una sola vez.

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mov_cc_int_orden ON public.movimientos_cuenta_corriente_intermediario (orden_id);

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.orden_id IS 'Opcional. Orden asociada (ej. movimiento de conversión para saldar por orden ejecutada).';
