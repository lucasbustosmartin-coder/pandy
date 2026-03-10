-- Migración: extender comisiones_orden para distribuir comisión entre Pandy e Intermediario
-- Ejecutar una sola vez.

ALTER TABLE public.comisiones_orden
  ADD COLUMN IF NOT EXISTS beneficiario text NOT NULL DEFAULT 'pandy' CHECK (beneficiario IN ('pandy', 'intermediario')),
  ADD COLUMN IF NOT EXISTS intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.comisiones_orden.beneficiario IS 'Quién se queda con esta porción de la comisión: pandy o intermediario.';
COMMENT ON COLUMN public.comisiones_orden.intermediario_id IS 'Intermediario beneficiario (si beneficiario=intermediario).';

