-- Saldo global CC del cliente (en la moneda de la trx) **antes** del flip C→P a P→C, para leyenda parcial/total coherente con la deuda.
-- Ejecutar en Supabase SQL Editor (dev y prod cuando corresponda).

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS compensacion_cc_saldo_cliente_moneda_antes numeric;

COMMENT ON COLUMN public.transacciones.compensacion_cc_saldo_cliente_moneda_antes IS
  'USD-USD con intermediario (sin MC): al guardar el flip, saldo global de CC del cliente en esa moneda antes de aplicar compensacion_cc_monto_aplicado (negativo = Pandy deudor). NULL si no aplica o legado sin dato.';
