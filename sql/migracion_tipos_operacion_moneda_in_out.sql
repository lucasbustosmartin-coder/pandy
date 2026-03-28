-- Tipos de operación: moneda recibida (IN) y entregada (OUT) para UI, filtros, wizard y CHEQUE-ARS.
-- Ejecutar en Supabase SQL Editor después de tener la tabla tipos_operacion (p. ej. supabase_complejidad_ordenes.sql).

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS moneda_in text,
  ADD COLUMN IF NOT EXISTS moneda_out text;

-- Desde código "X-Y" (USD-ARS, ARS-USD, CHEQUE-ARS, etc.)
UPDATE public.tipos_operacion t
SET
  moneda_in = upper(trim(split_part(t.codigo, '-', 1))),
  moneda_out = upper(trim(split_part(t.codigo, '-', 2)))
WHERE t.codigo IS NOT NULL
  AND strpos(t.codigo, '-') > 0
  AND (t.moneda_in IS NULL OR t.moneda_out IS NULL);

ALTER TABLE public.tipos_operacion
  DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_in_check;
ALTER TABLE public.tipos_operacion
  ADD CONSTRAINT tipos_operacion_moneda_in_check
  CHECK (moneda_in IS NULL OR moneda_in IN ('USD', 'EUR', 'ARS', 'CHEQUE'));

ALTER TABLE public.tipos_operacion
  DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_out_check;
ALTER TABLE public.tipos_operacion
  ADD CONSTRAINT tipos_operacion_moneda_out_check
  CHECK (moneda_out IS NULL OR moneda_out IN ('USD', 'EUR', 'ARS', 'CHEQUE'));

COMMENT ON COLUMN public.tipos_operacion.moneda_in IS 'Moneda que el cliente entrega / lado IN del acuerdo (UI y tipo de cambio). CHEQUE para CHEQUE-ARS.';
COMMENT ON COLUMN public.tipos_operacion.moneda_out IS 'Moneda que el cliente recibe / lado OUT del acuerdo.';
