-- Igualar estructura de movimientos_cuenta_corriente_intermediario a movimientos_cuenta_corriente (cliente).
-- 1) Permitir estado 'pendiente' (momento cero).
-- 2) Añadir monto_usd, monto_ars, monto_eur para misma regla conceptual y cálculo de saldo.
-- Ejecutar en Supabase SQL Editor.

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'movimientos_cuenta_corriente_intermediario' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%estado%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.movimientos_cuenta_corriente_intermediario DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD CONSTRAINT movimientos_cuenta_corriente_intermediario_estado_check
  CHECK (estado IN ('pendiente', 'cerrado', 'anulado'));

-- Columnas por moneda (igual que movimientos_cuenta_corriente). Si no NULL, se usan para el saldo.
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS monto_usd numeric(18,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_ars numeric(18,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_eur numeric(18,4) DEFAULT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.estado IS 'pendiente = momento cero (Pandy debe entregar); cerrado = ejecutado; anulado = revertido.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.monto_usd IS 'Importe en USD con signo. Si no NULL, se usa para saldo (igual que CC cliente).';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.monto_ars IS 'Importe en ARS con signo.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.monto_eur IS 'Importe en EUR con signo.';
