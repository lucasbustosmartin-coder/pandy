-- Cuenta corriente: transaccion_numero y modelo simplificado (Compromiso / Compromiso Saldado).
-- 1) Columna transaccion_numero en mov_cc y mov_cc_int (trazabilidad, concepto "y Trans Nro X").
-- 2) La regla simplificada: un registro por evento y por moneda del compromiso; sin uso de estado para pendiente/cerrado (solo anulado se excluye del saldo).
-- Ejecutar en Supabase SQL Editor.

-- ========== movimientos_cuenta_corriente (cliente) ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS transaccion_numero integer DEFAULT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.transaccion_numero IS 'Número interno de la transacción (transacciones.numero), para concepto y vista sin JOIN.';

-- Backfill desde transacciones
UPDATE public.movimientos_cuenta_corriente m
SET transaccion_numero = t.numero
FROM public.transacciones t
WHERE m.transaccion_id = t.id AND m.transaccion_numero IS NULL AND m.transaccion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mov_cc_transaccion_numero ON public.movimientos_cuenta_corriente (transaccion_numero) WHERE transaccion_numero IS NOT NULL;

-- ========== movimientos_cuenta_corriente_intermediario ==========
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS transaccion_numero integer DEFAULT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.transaccion_numero IS 'Número interno de la transacción (transacciones.numero), para concepto y vista.';

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET transaccion_numero = t.numero
FROM public.transacciones t
WHERE m.transaccion_id = t.id AND m.transaccion_numero IS NULL AND m.transaccion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mov_cc_int_transaccion_numero ON public.movimientos_cuenta_corriente_intermediario (transaccion_numero) WHERE transaccion_numero IS NOT NULL;
