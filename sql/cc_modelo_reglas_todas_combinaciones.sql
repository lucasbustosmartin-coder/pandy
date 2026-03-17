-- Todas las reglas del modelo CC. Las 16 combinaciones posibles de estados (E/P para Tx1,Tx2,Tx3,Tx4) quedan cubiertas:
-- cada tipo tiene 4 filas (estado × contrapartida_ejecutada); el lookup por transacción elige una fila, así que cualquier
-- combinación de 4 estados se resuelve con 4 lookups. Tabla bien cargada = resultado infalible.
-- Una fila por (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada).
-- Ejecutar en Supabase SQL Editor.
-- Referencia: docs/CC_MODELO_REFERENCIA.md, docs/CC_MODELO_MATRIZ_COMPLETA.md.

-- ========== 1. Con intermediario: ARS-ARS y ARS-ARS-CHEQUE ==========
-- 6 tipos × 4 (estado × contrapartida) × 2 códigos. UPSERT para sobrescribir.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision
) VALUES
-- Tx1: Cliente→Pandy ingreso (no comisión). Pendiente con contrapartida ejecutada: signo -, SUMA_SALDO Y (modelo), INCLUIR N.
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true, false, 0, false, false, NULL, false, NULL),
-- Tx2: Pandy→Cliente egreso. Según modelo: pendiente no suma ni se incluye en mov (SUMA_SALDO N, INCLUIR N).
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
-- Tx3: Pandy→Intermediario egreso (no comisión)
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, 1, false, true, 'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, 1, false, true, 'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, 1, false, true, 'pago_realizado', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, 1, false, true, 'pago_realizado', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false, NULL),
-- Tx4: Intermediario→Pandy ingreso. Según modelo: pendiente no suma ni se incluye en mov (igual que Tx2).
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false, -1, false, true, 'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false, -1, false, true, 'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, -1, false, false, NULL, true, NULL),
  ('ARS-ARS-CHEQUE', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false, -1, false, true, 'cobro_realizado', true, NULL),
  ('ARS-ARS-CHEQUE', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false, -1, false, true, 'cobro_realizado', true, NULL),
  ('ARS-ARS-CHEQUE', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, true, NULL),
  ('ARS-ARS-CHEQUE', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, -1, false, false, NULL, true, NULL),
-- Comisión Pandy: Cliente→Pandy ingreso, es_comision true. Se invierte el signo → +1 (CC cliente +5.000). Ejecutada: incluir si par no cerrado; Pendiente: incluir Y (modelo).
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, false, true, 0, false, false, 'comision_acuerdo', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, false, false, 0, false, false, 'comision_acuerdo', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, true, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, false, true, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, false, true, 0, false, false, 'comision_acuerdo', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, false, false, 0, false, false, 'comision_acuerdo', false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, true, 0, false, false, NULL, false, NULL),
  ('ARS-ARS-CHEQUE', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, false, true, 0, false, false, NULL, false, NULL),
-- Comisión Intermediario: Pandy→Intermediario egreso, es_comision true. Signo - (CC int -3.000). Pendiente: incluir Y (modelo).
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false, -1, false, true, 'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false, -1, false, true, 'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false, -1, false, true, NULL, false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false, -1, false, true, NULL, false, 'par_pandy_int'),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false, -1, false, true, 'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false, -1, false, true, 'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false, -1, false, true, NULL, false, 'par_pandy_int'),
  ('ARS-ARS-CHEQUE', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false, -1, false, true, NULL, false, 'par_pandy_int')
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;

-- ========== 2. Sin intermediario: ARS-USD, USD-USD, USD-ARS ==========
-- 2 tipos × 4 combinaciones × 3 códigos. Según modelo: pendiente no suma ni se incluye (igual que con intermediario).

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
)
SELECT codigo, false, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  0::smallint, false, false,
  concepto_leyenda, usa_monto_efectivo
FROM (VALUES ('ARS-USD'), ('USD-USD'), ('USD-ARS')) AS t(codigo)
CROSS JOIN (VALUES
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, NULL, false)
) AS r(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente, concepto_leyenda, usa_monto_efectivo)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo;
