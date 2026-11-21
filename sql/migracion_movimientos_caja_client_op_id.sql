-- Cola offline de caja idempotente (2026-11-20)
-- Cada movimiento manual de caja encolado sin red viaja con un identificador local (client_op_id). Si el envío se
-- corta después del INSERT y la app reintenta, el índice único rechaza el duplicado y el front lo da por enviado.
-- Cambio ADITIVO: columna nullable + índice único parcial. No modifica filas existentes.
-- Idempotente. Aplicar en Pandy-Dev y luego Pandy.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.movimientos_caja ADD COLUMN IF NOT EXISTS client_op_id text;
COMMENT ON COLUMN public.movimientos_caja.client_op_id IS
  'Identificador local de la operación (cola offline). Único cuando no es NULL: evita duplicar al reenviar.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimientos_caja_client_op_id
  ON public.movimientos_caja (client_op_id)
  WHERE client_op_id IS NOT NULL;

COMMIT;
