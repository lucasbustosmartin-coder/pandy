-- Parte del intermediario en efectivo vs transferencia bancaria (plantilla de instrumentación 2 tx).
-- Ejecutar en Supabase SQL Editor después de tener la tabla ordenes.
-- La app persiste el flag y al autocompletar usa modo_pago «transferencia» en la pata Cliente↔Intermediario (no aplica CHEQUE-ARS).

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS intermediario_pago_transferencia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ordenes.intermediario_pago_transferencia IS 'Si true, la transacción de la pata del intermediario (C→I o I→C según patrón) se crea con modo de pago transferencia; si false, efectivo. Ignorado sin intermediario o en CHEQUE-ARS.';
