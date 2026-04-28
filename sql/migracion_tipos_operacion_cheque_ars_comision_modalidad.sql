-- CHEQUE-ARS: modalidad de reparto de comisiones (tasa cliente vs tasa intermediario).
-- NULL = comportamiento histórico (obligatoria tasa intermediario estrictamente entre 0 y 100 %).
-- Valores: sin_comision | solo_intermediario | solo_pandy
-- Ejecutar en Supabase SQL Editor. Incluido en bootstrap dev (concat-bootstrap-dev-sql.js).

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS cheque_ars_comision_modalidad text;

ALTER TABLE public.tipos_operacion
  DROP CONSTRAINT IF EXISTS tipos_operacion_cheque_ars_comision_modalidad_check;

ALTER TABLE public.tipos_operacion
  ADD CONSTRAINT tipos_operacion_cheque_ars_comision_modalidad_check
  CHECK (
    cheque_ars_comision_modalidad IS NULL
    OR cheque_ars_comision_modalidad IN ('sin_comision', 'solo_intermediario', 'solo_pandy')
  );

COMMENT ON COLUMN public.tipos_operacion.cheque_ars_comision_modalidad IS
  'Solo CHEQUE-ARS: sin_comision (tasas 0/0), solo_intermediario (tasa cliente 0, tasa int. > 0), solo_pandy (tasa cliente > 0, tasa int. 0). NULL = legacy: tasa int. > 0 si tasa cliente 0; si tasa cliente > 0, tasa int. en [0,100) (0 = comisión solo empresa).';
