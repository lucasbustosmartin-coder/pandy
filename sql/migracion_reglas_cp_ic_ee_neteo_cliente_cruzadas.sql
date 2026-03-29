-- Patrón **cp_ic** (ingreso Cliente→Pandy + egreso Intermediario→Cliente), ambas ejecutadas (E,E):
-- La fila única con contrapartida_ejecutada=true dejaba en CC cliente solo el importe en moneda de la trx de entrega
-- sin el par −/+ que existe cuando contrapartida=false ni la compensación +mr en moneda recibida del acuerdo.
-- Síntoma: saldos ARS/USD (o EUR) distintos de cero pese a orden cerrada operativamente.
--
-- Ejecutar en Supabase SQL Editor (idempotente: ON CONFLICT DO UPDATE).
-- Espejo de la lógica documentada en tests/e2e/cc-intermediario-inversa-esperado.js (E,E).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  -- ARS-USD+int cp_ic: entrega USD en trx → par USD y cierre +mr ARS
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  -- USD-ARS+int cp_ic: entrega ARS en trx
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'USD', 1, 'mr', true, 'cobro_realizado'),
  -- USD-EUR+int cp_ic
  ('USD-EUR', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-EUR', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'USD', 1, 'mr', true, 'cobro_realizado'),
  -- EUR-USD+int cp_ic
  ('EUR-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('EUR-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'EUR', 1, 'mr', true, 'cobro_realizado'),
  -- ARS-EUR+int cp_ic
  ('ARS-EUR', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-EUR', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  -- EUR-ARS+int cp_ic
  ('EUR-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('EUR-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 2, 'EUR', 1, 'mr', true, 'cobro_realizado')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
