-- E,P USD-USD sin int: egreso pendiente con contrapartida ejecutada = dos líneas en reglas_de_negocio:
--   linea 0: +mr (anula deuda del cobro); linea 1: −me (lo que Pandy debe al cliente). Saldo neto −me.
-- Idempotente: reemplaza la fila única antigua (solo me +1) por el par de filas.
-- Ejecutar en Supabase si ya tenías la versión intermedia de migracion_reglas_usd_usd_sin_int.sql.

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
