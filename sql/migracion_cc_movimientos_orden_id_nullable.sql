-- CC manual y otros casos sin orden: orden_id y transaccion_id deben poder ser NULL.
-- Si ves: "null value in column orden_id ... violates not-null constraint" al guardar
-- movimiento manual desde la app, ejecutá este script en Supabase SQL Editor.

ALTER TABLE public.movimientos_cuenta_corriente
  ALTER COLUMN orden_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  ALTER COLUMN transaccion_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ALTER COLUMN orden_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ALTER COLUMN transaccion_id DROP NOT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.orden_id IS 'Orden asociada si aplica; NULL en movimientos manuales desde CC sin orden.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.orden_id IS 'Orden asociada si aplica; NULL en movimientos manuales sin orden.';
