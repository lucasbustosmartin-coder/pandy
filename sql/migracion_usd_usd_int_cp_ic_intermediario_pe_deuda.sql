-- USD-USD + intermediario (cp_ic): CC intermediario en P,E (ingreso C→P pendiente, egreso Int→Cliente ejecutado).
-- Antes: dos filas +m/−m en entidad intermediario con contrapartida_ejecutada false neteaban a cero y la comisión int.
--        solo buscaba regla con contrapartida true (par cerrado) → saldo int. incorrecto.
-- Después: una sola línea −me; nueva fila es_comision con contrapartida_ejecutada false (motor main.js).
--
-- Ejecutar en Supabase SQL Editor. Idempotente (UPSERT / DELETE acotado).
-- Fuente canónica alineada: sql/reglas_de_negocio_tabla.sql y sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql.

-- Quitar la segunda línea del par +/- (linea 1).
DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'intermediario'
  AND pagador = 'intermediario'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision IS FALSE
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS FALSE
  AND linea = 1;

-- Línea 0: un solo movimiento −me (signo −1).
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0,
   'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- Comisión intermediario cuando el cobro al cliente (C→P) sigue pendiente pero Int→Cliente ya ejecutó.
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0,
   'USD', -1, 'comision_intermediario', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
