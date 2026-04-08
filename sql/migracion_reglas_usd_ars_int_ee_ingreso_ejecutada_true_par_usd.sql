-- USD-ARS + intermediario — ingreso Cliente→Intermediario ejecutada con contrapartida (E,E).
-- Política actual: sin línea +mr en línea 2 (transacciones independientes en CC). Solo −me ARS y −mr USD.
-- Si la base tenía la fila antigua (línea 2 +mr), eliminarla:

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND COALESCE(usa_intermediario, false) = true
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS TRUE
  AND linea = 2
  AND monto_origen = 'mr'
  AND concepto_leyenda = 'cobro_realizado';

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'mr', true, 'cobro_realizado')
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
