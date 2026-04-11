-- Pandi: reglas faltantes cuando la contrapartida del par aún NO está ejecutada (ambas patas pendientes
-- o Tx4 Int→Pandy pendiente sin Tx3 ejecutada). El motor hace match exacto en `contrapartida_ejecutada`
-- (main.js `lookupReglasDeNegocio` + `contrapartidaEjecutada`).
--
-- Corrige: orden USD-USD+int cp_ic con ingreso C→P y egreso Int→Cliente ambos pendientes sin CC;
--         CHEQUE-ARS+int ingreso Intermediario→Pandy pendiente sin fila CC intermediario.
--
-- Idempotente (ON CONFLICT DO UPDATE). Ejecutar en Supabase SQL Editor (prod y/o dev).
-- Canónico alineado: `sql/reglas_de_negocio_tabla.sql` (bootstrap dev incluye ese archivo).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;
