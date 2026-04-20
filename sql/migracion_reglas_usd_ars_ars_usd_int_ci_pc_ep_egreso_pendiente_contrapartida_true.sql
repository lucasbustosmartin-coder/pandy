-- USD-ARS / ARS-USD + intermediario **ci_pc**, combinación **E,P** (ingreso Cliente→Intermediario ejecutado, egreso Pandy→Cliente pendiente).
-- `contrapartidaEjecutada` del egreso pendiente es **true** porque el cobro C→I ya está ejecutado; faltaba fila en `reglas_de_negocio`
-- (solo existía `pendiente`+`false` para P,P y `ejecutada` para cierre), provocando avisos del motor «sin fila en reglas».
-- Idempotente: ON CONFLICT alineado a `sql/reglas_de_negocio_tabla.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
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
