-- Tasa opcional sobre el monto de la pata del intermediario cuando paga por transferencia (comisión extra a cargo de la empresa).
-- Ejecutar en Supabase SQL Editor. Requiere columna intermediario_pago_transferencia.

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS intermediario_transferencia_cobra_tasa boolean NOT NULL DEFAULT false;

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS intermediario_transferencia_tasa numeric(18, 8);

COMMENT ON COLUMN public.ordenes.intermediario_transferencia_cobra_tasa IS 'Si true y pago transferencia en pata intermediario: aplica intermediario_transferencia_tasa (fracción, ej. 0.01 = 1%) sobre el monto de esa pata; el importe extra va a comisiones_orden del intermediario y reduce la parte Pandy del spread.';

COMMENT ON COLUMN public.ordenes.intermediario_transferencia_tasa IS 'Fracción 0–1 (misma convención que tasa_descuento_intermediario). Solo si intermediario_transferencia_cobra_tasa y intermediario_pago_transferencia.';
