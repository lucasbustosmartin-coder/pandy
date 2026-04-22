-- USD-ARS / ARS-USD + intermediario, patrón **cp_ic** (ingreso Cliente→Pandy + egreso Intermediario→Cliente),
-- combinación P,P (ambas transacciones pendientes).
--
-- `contrapartidaEjecutada()` devuelve **false** mientras la otra pata no esté ejecutada; el bootstrap en
-- `sql/reglas_de_negocio_tabla.sql` solo insertaba `pendiente`+`contrapartida_ejecutada = true` para estas
-- transacciones (caso «la otra ya ejecutó»). Sin filas `false`, el motor no matchea y aparece el toast
-- «hay transacciones que no coinciden con ninguna regla de negocio».
--
-- Idempotente: ON CONFLICT DO UPDATE (misma clave única que el resto de migraciones de reglas).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  -- USD-ARS + int cp_ic (mr USD, me ARS): espejo de filas `pendiente`+`true` en reglas_de_negocio_tabla.sql §cp_ic.
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 1, 'ARS', -1, 'me', true, 'compromiso_pago'),
  -- ARS-USD + int cp_ic (mr ARS, me USD).
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, 'ARS', 1, 'mr', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 1, 'USD', -1, 'me', true, 'compromiso_pago')
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
