-- USD-ARS / ARS-USD + intermediario **ci_pc**, combinación **P,E** (ingreso Cliente→Intermediario **pendiente**, egreso Pandy→Cliente **ejecutado**).
-- `contrapartidaEjecutada` del ingreso pendiente es **true** (ya hay egreso ejecutado). Faltaba fila **`entidad_cc = intermediario`**
-- para que la CC del intermediario muestre el cobro pendiente (+mr en moneda recibida del acuerdo), alineado a P,P línea intermediario con `pendiente`+`false`.
-- Idempotente: ON CONFLICT alineado a `sql/reglas_de_negocio_tabla.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'ARS', 1, 'mr', true, 'compromiso_cobrar')
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
