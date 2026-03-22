-- ARS-USD con intermediario - Flujo inverso operativo
-- Requiere columna linea_motor y UNIQUE ampliado: ejecutar antes sql/migracion_cc_modelo_reglas_linea_motor.sql (o cc_modelo_reglas_todas_combinaciones.sql completo).
-- Caso: Cliente->Intermediario (ingreso) y Pandy->Cliente (egreso)
-- Objetivo:
-- 1) CC cliente cierre igual que flujo estándar (Pandy central) según estado.
-- 2) CC intermediario refleje deuda del intermediario con Pandy en moneda recibida (mr).

-- A) Cliente -> Intermediario (ingreso) ejecutada:
--    - CC cliente: registra deuda de Pandy en moneda entregada (-me).
--    - CC intermediario: registra crédito de Pandy vs intermediario (+mr).
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
  cc_intermediario_moneda_exposicion = 'orden_recibida',
  cc_intermediario_monto_referencia = 'mr',
  concepto_leyenda = 'cobro_realizado'
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND linea_motor = 0;

-- B) Cliente -> Intermediario (ingreso) pendiente con contrapartida ejecutada, línea 0:
--    −me en USD (netea con +me del egreso). La línea 1 (−mr ARS) está en tabla con linea_motor = 1.
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
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND linea_motor = 0;

-- C) Pandy -> Cliente (egreso) ejecutada, contrapartida NO ejecutada (caso P,E):
--    +me netea USD con −me del ingreso pendiente; detalle cliente lista +me (incluir true) para ver cierre en USD.
--    CC intermediario: +me USD (lo que Pandy pagó). Sin espejo +mr ARS en main.js si ingreso C→Int pendiente.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me'
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND linea_motor = 0;

-- C2) Misma fila egreso ejecutada con contrapartida_ejecutada = true (E,E): detalle cliente incluye +me; intermediario sin movimiento en esta regla.
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
  incluir_en_mov_cc_intermediario = false,
  cc_intermediario_moneda_exposicion = NULL,
  cc_intermediario_monto_referencia = NULL
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = true
  AND linea_motor = 0;

-- D) Pandy -> Cliente (egreso) pendiente con contrapartida ejecutada:
--    cliente ya pagó al intermediario => Pandy queda debiendo al cliente (-me).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND linea_motor = 0;

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
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true,  -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,  -1, true, true,   0, false, false, 'compromiso_cobrar', false, 'orden_entregada', 'me', NULL, NULL),

  -- Pandy -> Cliente (egreso)
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false,  1, true, false,  1, true, true, 'compromiso_pago', false, 'orden_entregada', 'me', 'orden_entregada', 'me'),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,   1, true, true, 0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  -1, true, true,  0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL)
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

-- F) Misma clave lógica, linea_motor = 1: −mr en moneda recibida.
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
  'ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,
  -1, true, true, 0, false, false, 'compromiso_cobrar', false, 'orden_recibida', 'mr', NULL, NULL,
  1
)
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
