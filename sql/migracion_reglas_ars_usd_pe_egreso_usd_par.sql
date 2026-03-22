-- ARS-USD sin int — P,E: egreso ejecutado con ingreso aún pendiente (contrapartida_ejecutada = false).
-- Debe haber **dos** filas en USD (−me y +me, monto_transacción) para anular el doble registro del egreso en CC;
-- la tercera línea del detalle es el compromiso ARS (−mr) del ingreso pendiente.
-- Si solo tenías una fila (linea 0, signo +1), este script la reemplaza por el par vía UPSERT.
-- Ejecutar en Supabase SQL Editor después de alinear con `sql/reglas_de_negocio_tabla.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
