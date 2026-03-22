-- Canonico CHEQUE-ARS para tipo cheque en reglas CC y catálogo tipos_operacion.
-- Ejecutar en Supabase SQL Editor (entorno desarrollo primero).
-- Si el INSERT de reglas CHEQUE-ARS falla por columnas inexistentes, ejecutar antes
-- sql/migracion_cc_modelo_reglas_moneda_exposicion.sql

-- 0) Asegurar que checks de moneda permitan CHEQUE (si existen columnas/checks).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_in'
  ) THEN
    ALTER TABLE public.tipos_operacion
      DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_in_check;
    ALTER TABLE public.tipos_operacion
      ADD CONSTRAINT tipos_operacion_moneda_in_check
      CHECK (moneda_in IN ('USD', 'EUR', 'ARS', 'CHEQUE'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_out'
  ) THEN
    ALTER TABLE public.tipos_operacion
      DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_out_check;
    ALTER TABLE public.tipos_operacion
      ADD CONSTRAINT tipos_operacion_moneda_out_check
      CHECK (moneda_out IN ('USD', 'EUR', 'ARS', 'CHEQUE'));
  END IF;
END $$;

-- 1) Tipos de operación: renombrar código legacy ARS-ARS-CHEQUE -> CHEQUE-ARS.
-- Si CHEQUE-ARS ya existe, mantener ambos registros pero desactivar legacy.
DO $$
DECLARE
  v_id_legacy uuid;
  v_id_new uuid;
BEGIN
  SELECT id INTO v_id_legacy FROM public.tipos_operacion WHERE codigo = 'ARS-ARS-CHEQUE' LIMIT 1;
  SELECT id INTO v_id_new FROM public.tipos_operacion WHERE codigo = 'CHEQUE-ARS' LIMIT 1;

  IF v_id_legacy IS NOT NULL AND v_id_new IS NULL THEN
    UPDATE public.tipos_operacion
    SET codigo = 'CHEQUE-ARS',
        nombre = COALESCE(NULLIF(nombre, ''), 'CHEQUE - ARS')
    WHERE id = v_id_legacy;
  ELSIF v_id_legacy IS NOT NULL AND v_id_new IS NOT NULL THEN
    UPDATE public.tipos_operacion
    SET activo = false
    WHERE id = v_id_legacy;
  END IF;
END $$;

-- 2) Reglas CC: copiar/upsert legacy -> canonico y luego borrar legacy.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
)
SELECT
  'CHEQUE-ARS', usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'ARS-ARS-CHEQUE'
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision,
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'ARS-ARS-CHEQUE';

-- 3) (Opcional si existen columnas) alinear moneda_in/out del tipo canónico.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_in'
  ) THEN
    UPDATE public.tipos_operacion
    SET moneda_in = 'CHEQUE', moneda_out = 'ARS'
    WHERE codigo = 'CHEQUE-ARS';
  END IF;
END $$;
