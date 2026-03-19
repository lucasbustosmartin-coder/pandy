-- CC: dos flags por movimiento (suma al saldo / aparece en detalle).
-- Permite que saldo = suma(movimientos donde sumar_al_saldo) y detalle = solo filas con incluir_en_detalle.
-- Referencia: docs/ANALISIS_POR_QUE_CUESTA_CC_REGLAS.md, docs/CC_MODELO_MATRIZ_COMPLETA.md
-- Ejecutar en Supabase SQL Editor.

-- ========== movimientos_cuenta_corriente (cliente) ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS sumar_al_saldo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incluir_en_detalle boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.sumar_al_saldo IS 'Si true, este movimiento aporta al saldo CC. Si false, solo puede mostrarse en detalle o no (según incluir_en_detalle).';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.incluir_en_detalle IS 'Si true, este movimiento se muestra en el listado de detalle de CC.';

-- ========== movimientos_cuenta_corriente_intermediario ==========
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS sumar_al_saldo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incluir_en_detalle boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.sumar_al_saldo IS 'Si true, este movimiento aporta al saldo CC intermediario.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.incluir_en_detalle IS 'Si true, este movimiento se muestra en el detalle de CC intermediario.';
