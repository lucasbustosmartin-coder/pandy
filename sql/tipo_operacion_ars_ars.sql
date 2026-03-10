-- Tipo de operación ARS - ARS (CHEQUE): recibimos ARS, entregamos ARS. Sin tipo de cambio. Comisión = monto_recibido - monto_entregado.

INSERT INTO public.tipos_operacion (codigo, nombre) VALUES
  ('ARS-ARS', 'ARS - ARS (CHEQUE)')
ON CONFLICT (codigo) DO NOTHING;
