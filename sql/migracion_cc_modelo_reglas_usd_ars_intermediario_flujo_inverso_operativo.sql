-- USD-ARS con intermediario - Flujo inverso operativo
-- Caso: Cliente->Intermediario (ingreso) y Pandy->Cliente (egreso)
-- Objetivo:
-- 1) CC cliente cierre igual que flujo estándar (Pandy central) según estado.
-- 2) CC intermediario refleje que el intermediario retiene/fondea para Pandy.

-- A) Cliente -> Intermediario (ingreso) ejecutada:
--    - CC cliente: registra deuda de Pandy en moneda entregada (-me).
--    - CC intermediario: registra crédito de Pandy vs intermediario (+me).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_signo = 1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'cobro_realizado'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- B) Cliente -> Intermediario (ingreso) pendiente con contrapartida ejecutada (P,E — inverso de E,P):
--    Pandy ya pagó al cliente en ARS; el cliente aún no pagó USD al intermediario.
--    linea_motor 0: −me ARS (se anula con egreso ejecutado +me → saldo ARS neto 0).
--    linea_motor 1: −mr USD (debe USD 5000 hasta que el cliente pague al intermediario).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_cobrar',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND COALESCE(linea_motor, 0) = 0;

-- C) Pandy -> Cliente (egreso) ejecutada:
--    compensa/salda cliente en moneda entregada (+me).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- D) Pandy -> Cliente (egreso) pendiente con contrapartida ejecutada (linea_motor = 0):
--    No sumar −me otra vez en CC cliente: el ingreso ejecutado (A) ya dejó −me ARS; repetir aquí duplicaba a −10M ARS en E,P.
--    La compensación USD del espejo va en linea_motor = 1 (−mr USD, sql/migracion_cc_modelo_reglas_usd_ars_ep_egreso_pendiente_linea1_mr_usd.sql).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = false,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND COALESCE(linea_motor, 0) = 0;

-- E) Blindaje: garantizar existencia de filas para el flujo inverso (8 combinaciones),
--    evitando fallback legacy cuando falta alguna regla en entornos ya usados.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
) VALUES
  -- Cliente -> Intermediario (ingreso)
  -- Ejecutada: cliente queda -me; intermediario le debe a Pandy en USD (+mr).
  ('USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true,  -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  -- Pendiente: no impacta salvo si contrapartida (Pandy->Cliente) ya ejecutada.
  ('USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,  -1, true, true,   0, false, false, 'compromiso_cobrar', false, 'orden_entregada', 'me', NULL, NULL),

  -- Pandy -> Cliente (egreso)
  -- Ejecutada: compensa cliente +me.
  ('USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false,  1, true, true, 0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL),
  ('USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,   1, true, true, 0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL),
  -- Pendiente: no impacta salvo si contrapartida (Cliente->Intermediario) ya ejecutada.
  ('USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  -- linea_motor 0: sin movimiento CC cliente (el −me ARS ya está en ingreso ejecutado A); ver UPDATE D arriba.
  ('USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  -1, false, false,  0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

-- P,E: ingreso pendiente línea 1 — −mr USD en CC cliente (debe USD; el espejo +mr del egreso en main.js se omite si aplica esta fila).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,
  -1, true, true,
  0, false, false,
  'compromiso_cobrar', false,
  'orden_recibida', 'mr',
  NULL, NULL,
  1
)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

-- E,P: línea motor 1 (−mr USD) — cc_cliente_suma_saldo false (no “debe USD” fantasma; ver migracion_usd_ars_ep_egreso_pendiente_linea1_mr_usd.sql).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,
  -1, false, false,
  0, false, false,
  'compromiso_pago', false,
  'orden_recibida', 'mr',
  NULL, NULL,
  1
)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

