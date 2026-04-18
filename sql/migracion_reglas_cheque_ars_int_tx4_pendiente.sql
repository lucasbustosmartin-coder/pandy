-- CHEQUE-ARS + intermediario: reglas **pendientes** para Tx4 (ingreso Intermediario→Pandy, `monto_efectivo_intermediario`).
-- Quien ya aplicó `sql/migracion_reglas_cheque_ars_int_tx1_tx2_tx3_pendiente.sql` en una versión **sin** estas filas
-- ve CC con Tx1–Tx3 y comisiones pero sin movimiento con **Trans. 4** hasta ejecutar este script (o reaplicar el migración unificado).
--
-- Idempotente (ON CONFLICT DO UPDATE). Supabase SQL Editor (dev y prod).
-- Canónico: `sql/reglas_de_negocio_tabla.sql` + `sql/migracion_reglas_pendiente_contrapartida_false_usd_usd_int_y_cheque_tx4.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;
