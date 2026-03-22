-- USD-USD sin intermediario → única fuente `reglas_de_negocio` (alineado a USD-ARS / ARS-USD sin int).
-- Comisión implícita Pandy = mr − me (`monto_origen` = `mr_menos_me`); fila `es_comision` solo matchea con par cliente cerrado (E,E).
-- Ejecutar en Supabase SQL Editor después de tener `reglas_de_negocio` (p. ej. `sql/reglas_de_negocio_tabla.sql`).

ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_monto_origen_check;

ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_monto_origen_check CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario',
    'comision_intermediario'
  ));

COMMENT ON COLUMN public.reglas_de_negocio.monto_origen IS
  'mr/me: totales acuerdo. monto_transaccion: esta trx. me_prorrateado/mr_prorrateado: prorrateos. mr_menos_me: comisión implícita USD-USD (mr − me). monto_efectivo_intermediario/comision_intermediario: otros tipos (CHEQUE / USD-USD+int).';

-- Quitar fila obsoleta P,E (espejo +mr en ingreso pendiente); egreso ejecutado pasa a dos líneas −/+ monto_transacción.
DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND linea = 1;

-- Matriz cliente (equivalente a sql/cc_modelo_reglas_todas_combinaciones.sql §2 antes de migrar USD-USD).
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  -- P,E: Tx1 ingreso pendiente (+monto_transacción = cliente nos debe, convención CC positivo). Tx2 egreso ejecutado: −9.700 +9.700 anula el pago de Pandy; saldo neto +mr (deuda 10.000 a favor Pandy).
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  -- E,P (Tx2 egreso pendiente, contrapartida ejecutada): +mr anula deuda del cobro; −me es lo que Pandy debe al cliente (saldo neto −me).
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true, 0, 'USD', 1, 'mr_menos_me', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false;
