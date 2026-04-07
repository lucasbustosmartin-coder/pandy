-- Ci_pc: egreso Pandy→Cliente cuando el ingreso del cliente ya está ejecutado (E,E).
-- En ci_pc típico: Cliente→Intermediario ejecutado; `contrapartidaEjecutada` en main.js marca true en el egreso P→C.
-- El motor llama lookupReglasDeNegocio(..., contrapartida=true) **por cada transacción** y aplica **todas** las
-- filas que matchean (linea 0 y 1). Solo existía linea=0 +monto_transaccion; faltaba linea=1 −monto_transaccion
-- (como el par ± en egreso Inter→Cliente cp_ic). Sin linea=1 queda compromiso_pago positivo suelto.
--
-- **Órdenes multi-transacción (varios egresos P→C en moneda entregada):** no se rompe. Cada iteración del motor
-- usa el `monto` de **esa** transacción (`monto_transaccion`). Si hay N egresos ejecutados, hay N veces (+m_i −m_i)
-- en CC, no un único cierre sobre `me` total; compatible con `migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql`.
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
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-EUR', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('EUR-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('EUR-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-EUR', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'EUR', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT ON CONSTRAINT reglas_de_negocio_uniq
DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
