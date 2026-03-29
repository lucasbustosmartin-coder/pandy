-- USD-ARS con intermediario — flujo inverso operativo (2 tx: Cliente→Intermediario, Pandy→Cliente).
-- Fuente conceptual: sql/migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql
-- y bloques §4–§5 de sql/cc_modelo_reglas_todas_combinaciones.sql.
--
-- Requiere: sql/migracion_reglas_de_negocio_entidad_cc.sql
--
-- Motor en main.js: si hay filas aquí, USD-ARS+int usa `reglas_de_negocio` (ver docs/REG_NEG_USD_ARS_INT_PASO1.md).
-- `cc_modelo_reglas` puede convivir; no duplicar lógica en ambos motores a la vez para la misma orden.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  -- Cliente→Intermediario ingreso ejecutada, contrapartida false (E,P: egreso P→C aún no ejecutado):
  -- −mr USD, +mr USD (netean USD), −me ARS (posición abierta). Ver sql/migracion_reglas_usd_ars_int_ep_ingreso_ejecutada_contrapartida_false_tres_lineas.sql
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', 1, 'mr', true, 'cobro_realizado'),
  -- Ingreso ejecutada + contrapartida true (E,E): −me ARS y par −mr/+mr USD en detalle (neto USD 0). Ver sql/migracion_reglas_usd_ars_int_ee_ingreso_ejecutada_true_par_usd.sql
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 2, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', 1, 'mr', true, 'cobro_realizado'),
  -- Cliente→Intermediario ingreso pendiente + contrapartida ejecutada (P,E inverso)
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'me', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 1, 'USD', -1, 'mr', true, 'compromiso_cobrar'),
  -- Pandy→Cliente egreso ejecutado (compensa +me en ARS)
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'me', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'me', true, 'compromiso_pago')
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

-- Patrón **cp_ic** (Cliente→Pandy USD + Intermediario→Cliente ARS). Espejo de ARS-USD+int cp_ic.
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'ARS', -1, 'me', true, 'compromiso_pago')
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
