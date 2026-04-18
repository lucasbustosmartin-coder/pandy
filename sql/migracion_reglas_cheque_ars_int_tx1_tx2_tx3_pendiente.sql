-- CHEQUE-ARS + intermediario: el autocompletar crea las 4 transacciones en **pendiente**.
-- La matriz canónica tenía `estado_transaccion = ejecutada` para Tx1 (C→P) y Tx2 (P→C) en entidad **cliente**,
-- y para Tx3 (P→Int) solo `pendiente` con `contrapartida_ejecutada = true`, no **false**.
-- El motor hace match exacto (`lookupReglasDeNegocio` + `contrapartidaEjecutada`); sin filas pendiente
-- → toast «sin regla» y no se persisten movimientos CC salvo comisiones.
--
-- **Tx4 (ingreso Intermediario→Pandy):** con Tx3 aún pendiente, `contrapartida_ejecutada` es **false**; hacen falta
-- filas `pendiente` con `false` y `true` (monto `monto_efectivo_intermediario`). Sin ellas la CC muestra Tx1–Tx3
-- y comisiones pero **no** el movimiento ligado a la transacción 4 (ver `docs/CHEQUE_ARS_INTERMEDIARIO.md`).
--
-- Idempotente (ON CONFLICT DO UPDATE). Ejecutar en Supabase SQL Editor (dev y prod).
-- Canónico: `sql/reglas_de_negocio_tabla.sql`.
-- Si ya corriste este archivo **antes** de que incluyera Tx4, ejecutá también `sql/migracion_reglas_cheque_ars_int_tx4_pendiente.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
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
