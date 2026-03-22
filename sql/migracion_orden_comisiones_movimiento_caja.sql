-- Comisión intermediario sin transacción sintética: `orden_comisiones_generadas.transaccion_id` puede ser NULL
-- y se guarda el movimiento de caja asociado para revertir al pasar ejecutada→pendiente.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.orden_comisiones_generadas
  ALTER COLUMN transaccion_id DROP NOT NULL;

ALTER TABLE public.orden_comisiones_generadas
  ADD COLUMN IF NOT EXISTS movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orden_comisiones_generadas.movimiento_caja_id IS
  'Movimiento de caja del pago comisión intermediario cuando no hay transacción instrumentada (transaccion_id NULL).';
