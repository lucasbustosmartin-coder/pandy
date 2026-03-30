-- USD-USD + intermediario, patrón **ci_pc** (Cliente→Intermediario + Pandy→Cliente):
-- 1) CC intermediario: filas por ingreso C→Int (cobro mr).
-- 2) Reglas catálogo pueden incluir egreso P→C con entidad intermediario; el motor en main.js **no** inserta esa fila en ci_pc (bilateral Pandy–cliente; el UPDATE de signo abajo sigue si existiera la fila en catálogo).
-- 3) CC cliente: comisión mr−me cuando el ingreso es C→Int (fila es_comision; antes solo existía para C→Pandy).
--
-- Ejecutar en Supabase SQL Editor (prod/dev según corresponda). Idempotente (ON CONFLICT DO UPDATE).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', 1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', true, 'ejecutada', true, 0, 'USD', 1, 'mr_menos_me', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'intermediario'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision IS FALSE
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS TRUE
  AND linea = 0;
