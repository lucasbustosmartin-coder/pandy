-- USD-ARS / ARS-USD + intermediario, patrón ci_pc, combinación P,P (ambas transacciones pendientes).
-- El motor usa `contrapartida_ejecutada = false` cuando ninguna pata está ejecutada; faltaban filas en
-- `reglas_de_negocio` (solo existía `pendiente`+`true` en ingreso y solo `ejecutada` en egreso P→C),
-- lo que dejaba la sync sin CC y avisos «sin fila en reglas_de_negocio».
-- Idempotente: ON CONFLICT DO UPDATE alineado a `sql/reglas_de_negocio_tabla.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'ARS', 1, 'me', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 1, 'USD', 1, 'mr', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'me', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 1, 'ARS', 1, 'mr', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false, 0, 'ARS', 1, 'mr', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
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
