-- Operación CHEQUE (ARS-ARS): tasa de descuento del intermediario (ej. 0,01 = 1%).
-- Se usa para calcular el ingreso en efectivo que paga el intermediario: monto_recibido * (1 - tasa).
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS tasa_descuento_intermediario numeric(8,6) NULL;

COMMENT ON COLUMN public.ordenes.tasa_descuento_intermediario IS 'Para ARS-ARS (CHEQUE): tasa del intermediario, ej. 0.01 = 1%. Efectivo que recibe Pandy = monto_recibido * (1 - tasa).';
