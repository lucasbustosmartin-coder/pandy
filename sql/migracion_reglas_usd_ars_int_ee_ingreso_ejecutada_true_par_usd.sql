-- USD-ARS + intermediario — E,E: ingreso Cliente→Intermediario con contrapartida ejecutada (ambas tx E).
-- Sin −mr/+mr USD en CC cliente el detalle solo mostraba −me y +me ARS (2 ítems); el esperado E2E son 4:
-- −me ARS, −mr USD, +mr USD (ingreso) y +me ARS (egreso). Neto saldo 0 en ambas monedas.
-- Paralelo conceptual: sql/migracion_reglas_usd_ars_ee_ingreso_ejecutada_true_linea1_usd.sql (sin intermediario).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 2, 'USD', 1, 'mr', true, 'cobro_realizado')
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
