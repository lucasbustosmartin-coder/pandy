-- ARS-USD con intermediario — flujo inverso operativo (2 tx: Cliente→Intermediario en ARS, Pandy→Cliente en USD).
-- Espejo moneda de `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql` (mr/me siguen siendo monto_recibido / monto_entregado de la orden).
--
-- Requiere: sql/migracion_reglas_de_negocio_entidad_cc.sql
--
-- Motor en main.js: si hay filas aquí, ARS-USD+int usa `reglas_de_negocio` (ver docs/REG_NEG_ARS_USD_INT_PASO1.md).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  -- Cliente→Intermediario ingreso ejecutada, contrapartida false (E,P):
  -- −mr ARS, +mr ARS (netean ARS), −me USD (posición abierta). Paralelo USD-ARS con USD↔ARS.
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  -- Ingreso ejecutada + contrapartida true (E,E): −me USD y par −mr/+mr ARS en detalle.
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 2, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  -- Cliente→Intermediario ingreso pendiente + contrapartida ejecutada (P,E inverso)
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', -1, 'me', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 1, 'ARS', -1, 'mr', true, 'compromiso_cobrar'),
  -- Pandy→Cliente egreso ejecutado (compensa +me en USD)
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'me', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'me', true, 'compromiso_pago')
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
