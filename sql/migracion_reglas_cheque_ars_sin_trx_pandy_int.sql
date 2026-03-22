-- OBSOLETO si se usa instrumentación canónica con 4 transacciones (Tx3/Tx4 Pandy↔Intermediario).
-- Para volver al modelo canónico: ejecutar de nuevo **`sql/migracion_reglas_de_negocio_cheque_ars.sql`** (DELETE+INSERT completo CHEQUE-ARS+int).
--
-- CHEQUE-ARS + intermediario: CC intermediario sin filas en `transacciones` Pandy↔Intermediario.
-- La instrumentación queda solo con Cliente↔Pandy (ingreso cheque + egreso efectivo).
-- Se eliminan reglas ancladas a egreso Pandy→Intermediario e ingreso Intermediario→Pandy
-- y se reemplazan por reglas con el mismo efecto en CC intermediario ancladas a
-- ingreso Cliente→Pandy y egreso Pandy→Cliente (mismos estados/contrapartida que antes).
-- Ejecutar en Supabase SQL Editor después de consensuar el modelo en producción.

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'CHEQUE-ARS'
  AND usa_intermediario = true
  AND es_comision = false
  AND (
    (pagador = 'pandy' AND cobrador = 'intermediario' AND tipo_transaccion = 'egreso')
    OR (pagador = 'intermediario' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso')
  );

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  -- Era Tx3 (Pandy→Int egreso): mismo efecto CC int. al tener ingreso Cliente→Pandy
  ('CHEQUE-ARS', true, 'intermediario', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'mr', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'mr', true, 'pago_realizado', NULL),
  -- Era Tx4 (Int→Pandy ingreso efectivo neto): mismo efecto al ejecutar egreso Pandy→Cliente
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL)
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
