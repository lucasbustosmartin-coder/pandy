-- Pandi – Tipos de operación: unicidad (codigo, usa_intermediario)
-- Permite dos filas con el mismo código (ej. USD-ARS sin y con intermediario).
-- La app resuelve CC con getReglasCcModelo(codigo, usa_intermediario_desde_el_tipo), no desde intermediario_id.
-- Ejecutar en Supabase SQL Editor (después de migracion_tipos_operacion_usa_intermediario.sql).

-- 1) Normalizar columna usa_intermediario
UPDATE public.tipos_operacion
SET usa_intermediario = COALESCE(usa_intermediario, false);

ALTER TABLE public.tipos_operacion
  ALTER COLUMN usa_intermediario SET DEFAULT false,
  ALTER COLUMN usa_intermediario SET NOT NULL;

-- 2) Quitar UNIQUE solo sobre codigo (nombre típico: tipos_operacion_codigo_key)
ALTER TABLE public.tipos_operacion DROP CONSTRAINT IF EXISTS tipos_operacion_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_operacion_codigo_usa_intermediario
  ON public.tipos_operacion (codigo, usa_intermediario);

COMMENT ON TABLE public.tipos_operacion IS 'Catálogo de tipos. codigo puede repetirse si usa_intermediario difiere (ej. USD-ARS directo vs intermediado).';

-- 3) Fila USD-ARS sin intermediario: nombre claro (antes de crear la variante con intermediario)
UPDATE public.tipos_operacion
SET usa_intermediario = false,
    nombre = 'USD - ARS (sin intermediario)'
WHERE codigo = 'USD-ARS'
  AND usa_intermediario = false
  AND NOT EXISTS (
    SELECT 1 FROM public.tipos_operacion x
    WHERE x.codigo = 'USD-ARS' AND x.usa_intermediario = true
  );

-- 4) Segunda fila USD-ARS con intermediario (si no existe)
INSERT INTO public.tipos_operacion (
  codigo, nombre, moneda_in, moneda_out, usa_intermediario, activo,
  icono_modo, icono_url_publica
)
SELECT
  t.codigo,
  'USD - ARS (con intermediario)',
  t.moneda_in,
  t.moneda_out,
  true,
  COALESCE(t.activo, true),
  COALESCE(t.icono_modo, 'auto'),
  t.icono_url_publica
FROM public.tipos_operacion t
WHERE t.codigo = 'USD-ARS'
  AND t.usa_intermediario = false
  AND NOT EXISTS (
    SELECT 1 FROM public.tipos_operacion x
    WHERE x.codigo = 'USD-ARS' AND x.usa_intermediario = true
  )
LIMIT 1;

-- 5) Reglas CC: USD-ARS con intermediario = misma matriz que CHEQUE-ARS con intermediario (punto de partida; calibrar según negocio)
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  condicion_estado_comision
)
SELECT
  'USD-ARS',
  true,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.cc_cliente_signo,
  r.cc_cliente_suma_saldo,
  r.incluir_en_mov_cc_cliente,
  r.cc_intermediario_signo,
  r.cc_intermediario_suma_saldo,
  r.incluir_en_mov_cc_intermediario,
  r.concepto_leyenda,
  r.usa_monto_efectivo,
  r.cc_cliente_moneda_exposicion,
  r.cc_cliente_monto_referencia,
  r.cc_intermediario_moneda_exposicion,
  r.cc_intermediario_monto_referencia,
  r.condicion_estado_comision
FROM public.cc_modelo_reglas r
WHERE r.tipo_operacion_codigo = 'CHEQUE-ARS'
  AND r.usa_intermediario = true
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada
) DO NOTHING;

-- Si no hay matriz CHEQUE-ARS con intermediario, clonar ARS-ARS con intermediario
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  condicion_estado_comision
)
SELECT
  'USD-ARS',
  true,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.cc_cliente_signo,
  r.cc_cliente_suma_saldo,
  r.incluir_en_mov_cc_cliente,
  r.cc_intermediario_signo,
  r.cc_intermediario_suma_saldo,
  r.incluir_en_mov_cc_intermediario,
  r.concepto_leyenda,
  r.usa_monto_efectivo,
  r.cc_cliente_moneda_exposicion,
  r.cc_cliente_monto_referencia,
  r.cc_intermediario_moneda_exposicion,
  r.cc_intermediario_monto_referencia,
  r.condicion_estado_comision
FROM public.cc_modelo_reglas r
WHERE r.tipo_operacion_codigo = 'ARS-ARS'
  AND r.usa_intermediario = true
  AND NOT EXISTS (
    SELECT 1 FROM public.cc_modelo_reglas z
    WHERE z.tipo_operacion_codigo = 'USD-ARS' AND z.usa_intermediario = true
  )
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada
) DO NOTHING;
