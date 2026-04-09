-- USD-USD: persistir si la tasa al cliente se interpreta como descuento sobre lo recibido o incremento sobre lo entregado (inclusiva).
-- Ejecutar en Supabase SQL Editor. Luego reemplazar la RPC con sql/ordenes_insertar_con_proximo_numero.sql (firma actualizada).

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS usd_usd_tasa_cliente_modo text;

ALTER TABLE public.ordenes
  DROP CONSTRAINT IF EXISTS ordenes_usd_usd_tasa_cliente_modo_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_usd_usd_tasa_cliente_modo_check
  CHECK (usd_usd_tasa_cliente_modo IS NULL OR usd_usd_tasa_cliente_modo IN ('descuento', 'incremento'));

COMMENT ON COLUMN public.ordenes.usd_usd_tasa_cliente_modo IS
  'Solo USD-USD: descuento → monto_entregado = monto_recibido×(1−t/100); incremento → monto_entregado = monto_recibido/(1+t/100). NULL = descuento (órdenes previas).';
