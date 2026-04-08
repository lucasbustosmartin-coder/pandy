-- ARS-USD + intermediario: insertar solo filas que aún no existan en `reglas_de_negocio`.
--
-- Seguro si ya tenés datos: no hay DELETE/TRUNCATE/UPDATE masivo. Solo INSERT;
-- si la clave única ya existe, esa fila se omite (DO NOTHING).
--
-- Requiere el UNIQUE sobre (tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador,
-- tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea) como en `sql/reglas_de_negocio_tabla.sql`.
-- Doc: `docs/REG_NEG_ARS_USD_INT_PASO1.md`

-- --- Paso 1 (opcional): mirar qué hay hoy ---
-- Esperado si falta todo el bloque ci_pc: count = 0. Con ci_pc completo: count = 12.
-- Si tus transacciones son **Cliente→Pandy** + **Intermediario→Cliente** (patrón cp_ic del panel viejo), además ejecutá `sql/insert_reglas_ars_usd_int_cp_ic_si_faltan.sql`.
SELECT count(*) AS filas_ars_usd_con_int
FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true;

-- Detalle (opcional):
-- SELECT tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion,
--        es_comision, estado_transaccion, contrapartida_ejecutada, linea, moneda, concepto_leyenda
-- FROM public.reglas_de_negocio
-- WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = true
-- ORDER BY entidad_cc, tipo_transaccion, estado_transaccion, contrapartida_ejecutada, linea;

-- --- Paso 2: insertar solo lo que falte ---
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', -1, 'me', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 1, 'ARS', -1, 'mr', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'me', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO NOTHING;

-- --- Paso 3 (opcional): verificar después ---
-- SELECT count(*) FROM public.reglas_de_negocio
-- WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = true;
-- Tras insert completo: debería dar 12.
