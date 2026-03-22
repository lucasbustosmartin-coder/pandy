-- Pandi – USD-USD con intermediario: reglas CC para ingreso **Cliente→Intermediario**
-- (misma matriz que ingreso Cliente→Pandy; patrón alternativo de instrumentación).
-- Ejecutar en Supabase SQL Editor si la base ya tenía USD-USD true sin estas filas.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
