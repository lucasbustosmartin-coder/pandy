-- ARS-USD + intermediario — patrón **cp_ic** (ingreso Cliente→Pandy en ARS, egreso Intermediario→Cliente en USD).
-- Si ya cargaste `insert_reglas_ars_usd_con_intermediario_si_faltan.sql` tenés solo **ci_pc** (12 filas).
-- El panel de órdenes autocompletaba con **cp_ic** hasta el fix en main.js; sin estas 8 filas el motor no generaba movimientos CC.
--
-- Solo INSERT + ON CONFLICT DO NOTHING (no borra ni actualiza filas existentes).

SELECT count(*) AS filas_ars_usd_int_cp_ic_aprox
FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso';

-- Si lo anterior da 0, conviene ejecutar el bloque siguiente.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'mr', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO NOTHING;
