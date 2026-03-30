-- Fragmento versionado en el repo (lectura / diff). **No ejecutar este archivo en Supabase.**
-- Única vía de ejecución: `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` (paso 2b = este INSERT).
--
-- CC intermediario en patrón **ci_pc** solo para **USD-USD + intermediario** (misma moneda en ambas patas):
-- filas `entidad_cc = intermediario` para egreso Pandy→Cliente (espejo de la entidad cliente en esa pata).
-- Cruces USD-ARS / ARS-USD +int: CC int. ci_pc ya modelada vía ingreso Cliente→Intermediario (reglas existentes).
-- En **cp_ic** no existe egreso Pandy→Cliente → estas filas no matchean.
-- Comisión intermediario USD-USD+int en ci_pc: signo invertido en `main.js` (patronInstrumentacionIntDesdeTransacciones).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
