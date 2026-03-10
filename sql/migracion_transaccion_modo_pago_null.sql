-- Permitir modo_pago_id NULL en transacciones (ej. compensaciones auto-generadas sin definir modo de pago)
-- Ejecutar una sola vez.

ALTER TABLE public.transacciones
  ALTER COLUMN modo_pago_id DROP NOT NULL;

COMMENT ON COLUMN public.transacciones.modo_pago_id IS 'Opcional. Null = sin definir (ej. compensaciones pendientes de completar).';
