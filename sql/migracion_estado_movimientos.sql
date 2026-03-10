-- Pandi – Estados en movimientos (cerrado / anulado) con fecha log
-- Ejecutar en Supabase SQL Editor después de tener datos (o en proyecto nuevo).
-- En vez de borrar al revertir una orden, se marca estado = 'anulado' y se registra estado_fecha.

-- ========== 1. Movimientos de caja ==========
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'anulado')),
  ADD COLUMN IF NOT EXISTS estado_fecha timestamptz DEFAULT now();

-- Rellenar por si las columnas ya existían sin default
UPDATE public.movimientos_caja SET estado = 'cerrado', estado_fecha = COALESCE(created_at, now()) WHERE estado IS NULL OR estado_fecha IS NULL;

COMMENT ON COLUMN public.movimientos_caja.estado IS 'cerrado = vigente en saldos; anulado = revertido (ej. orden desconcertada), no suma.';
COMMENT ON COLUMN public.movimientos_caja.estado_fecha IS 'Fecha/hora en que se estableció el estado actual (log).';

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_estado ON public.movimientos_caja (estado);

-- ========== 2. Movimientos cuenta corriente ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'anulado')),
  ADD COLUMN IF NOT EXISTS estado_fecha timestamptz DEFAULT now();

UPDATE public.movimientos_cuenta_corriente SET estado = 'cerrado', estado_fecha = COALESCE(created_at, now()) WHERE estado IS NULL OR estado_fecha IS NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.estado IS 'cerrado = vigente en saldos; anulado = revertido (ej. orden desconcertada), no suma.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.estado_fecha IS 'Fecha/hora en que se estableció el estado actual (log).';

CREATE INDEX IF NOT EXISTS idx_mov_cc_estado ON public.movimientos_cuenta_corriente (estado);
