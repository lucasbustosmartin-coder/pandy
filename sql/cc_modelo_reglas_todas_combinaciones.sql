-- =============================================================================
-- REGLAS CC: ejecutar TODO este archivo en Supabase SQL Editor.
-- Abrís sql/cc_modelo_reglas_todas_combinaciones.sql, copiás todo y pegás en el
-- editor de Supabase, luego Run. Antes del test E2E: ejecutar este script y
-- luego sql/truncar_ordenes_transacciones.sql si querés arranque limpio.
-- =============================================================================
--
-- Matriz completa CC: cada tipo tiene 4 filas (estado_transaccion × contrapartida_ejecutada).
-- Lookup: (pagador, cobrador, tipo, es_comision, estado_transaccion, contrapartida_ejecutada).
-- Con la tabla bien cargada, cualquier combinación E/P de Tx1..Tx4 sale sola.
--
-- CLIENTE: detalle = saldo. Tx1 -200k (suma/incluir según fila), Tx2 +195k, Comisión +5k.
-- INTERMEDIARIO: detalle = solo 2 líneas: Tx3 -200k, Tx4 +197k. Saldo = -200k+197k = -3k. Comisión no es línea.
--
-- Tx1: (E,false)=Tx2 P: -1,Y,Y. (E,true)=par cerrado: -1,Y,N. (P,false): 0,N,N. (P,true): -1,Y,N.
-- Tx2: (E,false)=Tx1 P: 1,Y,Y. (E,true)=par cerrado: 1,N,Y. (P,false): 0,N,N. (P,true): 1,N,N.
-- Tx3: (E,false),(E,true): -1,Y,Y. (P,false),(P,true): -1,Y,Y. [todas escriben -200k]
-- Tx4: (E,false),(E,true): 1,Y,Y. (P,false),(P,true): 1,Y,Y. [todas escriben +197k, usa_monto_efectivo]
-- Comisión Pandy: 4 filas: 1,N,Y (cliente). Comisión Int: 4 filas: -1,N,N (no línea en detalle int).
-- Ejecutar en Supabase SQL Editor.

-- ========== 1. Con intermediario: ARS-ARS y CHEQUE-ARS ==========

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision
) VALUES
-- Tx1: Cliente→Pandy ingreso. (P,true)=cliente aún no pagó, Tx2=E: NO sumar para que saldo cliente = +200k (debe 200k); detalle = +195k+5k.
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, false, false, 0, false, false, NULL, false, NULL),
-- Tx2: Pandy→Cliente egreso. Par cerrado (E,true): SUMA Y e INCLUIR Y para que saldo = -200k+195k+5k = 0.
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
-- Tx3: suma al saldo (-200k). En detalle: (E,false) y (P,true) SÍ incluir (nominal -200k para E,E,E,P y E,E,P,E).
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, -1, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, -1, true,  true,  NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, -1, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, -1, true,  true,  NULL, false, NULL),
-- Tx4: Par cerrado (E,true) SUMA Y e INCLUIR. (E,false) no incluir para E,E,P,E (detalle solo Tx3 -200k + comisión).
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false,  1, false, false, 'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false,  1, true,  true,  'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false,  1, false, false, NULL, true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false,  1, false, false, 'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false,  1, true,  true,  'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false,  1, false, false, NULL, true, NULL),
-- Comisión Pandy: condicion_estado_comision = par_cliente (ejecutada si par cerrado O Tx2 ejecutada; así P,E,P,P suma +5k y saldo 200k).
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, true,  true, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, true,  true, 0, false, false, NULL, false, 'par_cliente'),
-- Comisión Intermediario: Par cerrado (E,true) SUMA Y para saldo int = 0. (P,true) también SUMA Y para E,E,E,P: saldo -200k+3k = -197k.
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false,  1, false, true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false,  1, true,  true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false,  1, false, false, NULL, false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false,  1, true,  true,  NULL, false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false,  1, false, true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false,  1, true,  true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false,  1, false, false, NULL, false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false,  1, true,  true,  NULL, false, 'par_pandy_int')
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
-- Misma lógica par cliente: (E,true) suma_saldo Y en ingreso, incluir N; (E,true) en egreso suma_saldo N, incluir Y.

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
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  false, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true,  false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true,  'compromiso_pago', false),
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
