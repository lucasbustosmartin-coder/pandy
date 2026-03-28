-- CC cliente: importes por moneda (alineado a sync_cc_caja_orden y main.js) y estado pendiente (momento cero).
-- Ejecutar en Supabase SQL Editor después de supabase_tablas_negocio / complejidad (tabla movimientos_cuenta_corriente).

ALTER TABLE public.movimientos_cuenta_corriente DROP CONSTRAINT IF EXISTS movimientos_cuenta_corriente_estado_check;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD CONSTRAINT movimientos_cuenta_corriente_estado_check
  CHECK (estado IN ('pendiente', 'cerrado', 'anulado'));

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS monto_usd numeric(18,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_ars numeric(18,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_eur numeric(18,4) DEFAULT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.monto_usd IS 'Importe en USD con signo; si no NULL, participa del saldo por moneda.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.monto_ars IS 'Importe en ARS con signo.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.monto_eur IS 'Importe en EUR con signo.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.estado IS 'pendiente = momento cero; cerrado = vigente en saldo; anulado = excluido.';
