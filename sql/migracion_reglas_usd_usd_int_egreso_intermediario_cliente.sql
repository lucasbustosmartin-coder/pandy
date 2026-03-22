-- Pandi – USD-USD con intermediario: reglas CC para egreso **Intermediario→Cliente**
-- (misma matriz que egreso Pandy→Cliente; instrumentación canónica Tx2 = int entrega al cliente).
-- Ejecutar en Supabase SQL Editor si ya tenías el bloque USD-USD true sin estas filas.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
