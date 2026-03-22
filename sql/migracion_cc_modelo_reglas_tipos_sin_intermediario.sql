-- Pandi – Reglas CC para tipos activos sin intermediario (ARS-USD, USD-USD, USD-ARS)
-- Alineado con sql/cc_modelo_reglas_tabla.sql §2b (única fuente de verdad).
-- Requiere columnas cc_cliente_moneda_exposicion / cc_cliente_monto_referencia; si no existen,
-- ejecutar antes sql/migracion_cc_modelo_reglas_moneda_exposicion.sql (ALTER + UPDATE general).
-- Excepciones:
-- - P,E (ingreso pendiente + contrapartida ejecutada): orden_recibida + mr + compromiso_cobrar
--   (evita anular en saldo el compromiso del egreso en dos monedas). Ver también
--   sql/migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql para corregir solo esa fila.
-- - USD-USD ingreso: transaccion + monto_transaccion (cobro bruto), no me.
-- Ejecutar en Supabase SQL Editor.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
)
SELECT codigo, false, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  0, false, false,
  concepto_leyenda, usa_monto_efectivo,
  CASE
    WHEN codigo = 'USD-USD' AND pagador = 'cliente' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = false
      THEN 'transaccion'::text
    ELSE cli_mon_exp
  END,
  CASE
    WHEN codigo = 'USD-USD' AND pagador = 'cliente' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = false
      THEN 'monto_transaccion'::text
    ELSE cli_monto_ref
  END,
  NULL::text, NULL::text
FROM (VALUES
  ('ARS-USD'), ('USD-USD'), ('USD-ARS')
) AS t(codigo)
CROSS JOIN (VALUES
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true, true, 'cobro_realizado', false, 'orden_entregada'::text, 'me'::text),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me'),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false, 'orden_entregada', 'me'),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true, true, 'compromiso_cobrar', false, 'orden_recibida', 'mr'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true, true, 'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true, true, 'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion'),
  -- Egreso pendiente con contrapartida ejecutada (Tx1 cerrada): espejo en moneda recibida (+mr) solo detalle, no saldo.
  ('pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, true, 'compromiso_pago', false, 'orden_recibida', 'mr')
) AS r(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente, concepto_leyenda, usa_monto_efectivo, cli_mon_exp, cli_monto_ref)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor) DO UPDATE SET
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
