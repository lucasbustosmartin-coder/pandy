-- USD-ARS sin int, E,E: al ejecutarse Tx1 y Tx2, el ingreso matchea reglas con contrapartida_ejecutada=true.
-- Sin esta fila solo se generaba la línea ARS del ingreso true y quedaba +USD neto del egreso (saldo USD ≠ 0).
-- Complementa la fila ingreso ejecutada true linea 0 (ARS).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1,
   'USD', -1, 'monto_transaccion', true, 'cobro_realizado')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
