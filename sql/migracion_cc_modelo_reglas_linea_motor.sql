-- Pandi – Varias filas de motor por la misma clave lógica (regla de oro: todo en tabla).
-- Añade linea_motor (0, 1, …) al UNIQUE para permitir p. ej. ARS-USD+int:
-- ingreso Cliente→Intermediario pendiente + contrapartida ejecutada → línea 0: −me en USD; línea 1: −mr en ARS.
-- Ejecutar antes de reaplicar migraciones que hagan UPDATE por clave sin linea_motor (usar linea_motor = 0 en WHERE).

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS linea_motor smallint NOT NULL DEFAULT 0;

UPDATE public.cc_modelo_reglas SET linea_motor = 0 WHERE linea_motor IS NULL;

ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_estado_contrapartida_uniq;

ALTER TABLE public.cc_modelo_reglas
  ADD CONSTRAINT cc_modelo_reglas_estado_contrapartida_uniq
  UNIQUE (
    tipo_operacion_codigo,
    usa_intermediario,
    pagador,
    cobrador,
    tipo_transaccion,
    es_comision,
    estado_transaccion,
    contrapartida_ejecutada,
    linea_motor
  );

COMMENT ON COLUMN public.cc_modelo_reglas.linea_motor IS
  'Orden de aplicación (0, 1, …) cuando hay más de un movimiento CC para la misma transacción y clave lógica; el motor aplica todas las filas que matcheen, ordenadas por linea_motor.';

-- Segunda fila: deuda viva en moneda recibida (−mr); la línea 0 sigue en tabla / migración ARS-USD (−me en USD).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo,
  usa_intermediario,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea_motor,
  cc_cliente_signo,
  cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente,
  cc_intermediario_signo,
  cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario,
  concepto_leyenda,
  usa_monto_efectivo,
  cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia
) VALUES (
  'ARS-USD',
  true,
  'cliente',
  'intermediario',
  'ingreso',
  false,
  'pendiente',
  true,
  1,
  -1,
  true,
  true,
  0,
  false,
  false,
  'compromiso_cobrar',
  false,
  'orden_recibida',
  'mr',
  NULL,
  NULL
)
ON CONFLICT (
  tipo_operacion_codigo,
  usa_intermediario,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea_motor
)
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
