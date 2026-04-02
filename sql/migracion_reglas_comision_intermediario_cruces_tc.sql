-- Comisión intermediario en CC para cruces con tipo de cambio + intermediario (ARS↔USD y EUR↔USD).
-- Incluye `estado_transaccion = pendiente` para que la fila sintética exista aunque el egreso Inter→Cliente siga pendiente
-- (visible en CC intermediario como pendiente hasta cerrar el par).
-- Pares ARS↔EUR sin USD no están en `patronTipoCambioOrden` del front hoy; si se agregan, extender migración + main.js.
--
-- Nota front: si el catálogo usa otro `tipos_operacion.codigo` (p. ej. compra_usd), `main.js` fusiona reglas al sync.
--
-- Ejecutar en Supabase SQL Editor (prod/dev) después de tener `reglas_de_negocio` base.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('ARS-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('ARS-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('EUR-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('EUR-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('EUR-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-EUR', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-EUR', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo'),
  ('USD-EUR', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
