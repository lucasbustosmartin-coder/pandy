-- Reversar a pendiente: solo una vez por transacción.
-- Cuando el usuario intenta reversar por segunda vez, la app muestra mensaje empático y sugiere anular la orden.
ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS revertida_una_vez boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transacciones.revertida_una_vez IS 'True si en algún momento se pasó de ejecutada a pendiente (reversión). No se permite una segunda reversión.';
