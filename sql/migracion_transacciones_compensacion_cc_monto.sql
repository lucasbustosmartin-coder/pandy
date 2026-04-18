-- Compensación CC al invertir ingreso Cliente→Pandy a Pandy→Cliente (USD-USD + intermediario, sin MC).
-- El front valida saldo global del cliente (Pandy deudor = saldo negativo en CC) y persiste el monto reconocido;
-- el sync inserta una fila CC «Compensación parcial/total en cuenta corriente- Orden … y Trans …» vinculada a la transacción.
-- Ejecutar en Supabase SQL Editor (dev y luego prod cuando corresponda).

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS compensacion_cc_monto_aplicado numeric;

COMMENT ON COLUMN public.transacciones.compensacion_cc_monto_aplicado IS
  'USD-USD con intermediario (sin multicontraparte manual): al guardar ingreso invertido C→P a P→C, monto reconocido contra deuda previa de Pandy con el cliente (CC). El sync genera movimiento «Compensación parcial/total en cuenta corriente- Orden … y Trans …». NULL si no aplica.';
