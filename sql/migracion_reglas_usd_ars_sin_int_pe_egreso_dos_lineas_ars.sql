-- Pandi – USD-ARS sin intermediario, combinación **P,E**: egreso ejecutado con contrapartida false.
-- Pasa de **una** línea ARS a **dos** (−/+ monto_transacción), espejo de ARS-USD (dos USD) y de la definición de producto:
-- transacción ejecutada → par de movimientos que anulan; pendiente → una línea.
--
-- Ejecutar en Supabase SQL Editor si la base aún tiene solo la fila linea=0 signo +1.
-- Idempotente: ON CONFLICT actualiza signos/contenido.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'egreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago')
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
