-- Ci_pc: egreso Pandy→Cliente cuando el ingreso del cliente ya está ejecutado (E,E).
-- **2026-04 — valores canónicos en este script:** la linea=1 es **+mr_prorrateado** en **moneda recibida** del acuerdo (igual que `sql/reglas_de_negocio_tabla.sql`). Versiones viejas insertaban **−monto_transacción** en moneda entregada (neteaba el egreso en 0 y dejaba **−me** del ingreso sin compensar → invariante CC). Re-ejecutar este archivo **ya no** revierte un arreglo previo (`ON CONFLICT` escribe los mismos datos correctos).
-- En ci_pc típico: Cliente→Intermediario ejecutado; `contrapartidaEjecutada` en main.js marca true en el egreso P→C.
-- El motor aplica linea 0 y 1 para `contrapartida_ejecutada = true`. Sin linea=1 queda compromiso_pago positivo suelto en monE;
-- la segunda pata debe ser **en moneda recibida** (+mr_prorrateado), no un segundo movimiento en monE.
--
-- **Órdenes multi-transacción (varios egresos P→C):** cada iteración usa el monto de **esa** transacción: línea 0 en monE
-- y línea 1 en monR con `mr_prorrateado`. Compatible con `migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql`.
--
-- Idempotente: INSERT ... ON CONFLICT DO UPDATE.
-- Ejecutar en Supabase SQL Editor tras migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql si aplica.
-- Luego resincronizar órdenes afectadas.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('USD-EUR', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('EUR-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('EUR-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('ARS-EUR', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago')
ON CONFLICT ON CONSTRAINT reglas_de_negocio_uniq
DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
