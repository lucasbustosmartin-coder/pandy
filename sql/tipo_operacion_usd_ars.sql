-- Tipo de operación USD - ARS (inversa de ARS - DOLAR): recibimos USD, entregamos ARS.
-- Tipo de cambio del acuerdo = ARS por 1 USD. Comisión USD = monto_recibido_USD - (monto_entregado_ARS / tipo_cambio).

INSERT INTO public.tipos_operacion (codigo, nombre) VALUES
  ('USD-ARS', 'USD - ARS')
ON CONFLICT (codigo) DO NOTHING;
