-- Pandi – Tabla de reglas del modelo de cuenta corriente (CC)
-- Una fila por cada combinación posible: tipo operación, pagador, cobrador, tipo transacción,
-- estado de la transacción (pendiente/ejecutada), contrapartida ejecutada (sí/no), etc.
-- Referencia: docs/CC_MODELO_REFERENCIA.md y docs/CC_MODELO.xlsx

-- ========== 1. Tabla ==========
CREATE TABLE IF NOT EXISTS public.cc_modelo_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_operacion_codigo text NOT NULL,
  usa_intermediario boolean NOT NULL DEFAULT false,
  pagador text NOT NULL CHECK (pagador IN ('cliente', 'pandy', 'intermediario')),
  cobrador text NOT NULL CHECK (cobrador IN ('cliente', 'pandy', 'intermediario')),
  tipo_transaccion text NOT NULL CHECK (tipo_transaccion IN ('ingreso', 'egreso')),
  es_comision boolean NOT NULL DEFAULT false,
  estado_transaccion text NOT NULL CHECK (estado_transaccion IN ('pendiente', 'ejecutada')),
  contrapartida_ejecutada boolean NOT NULL DEFAULT false,
  linea_motor smallint NOT NULL DEFAULT 0,
  cc_cliente_signo smallint CHECK (cc_cliente_signo IS NULL OR cc_cliente_signo IN (-1, 0, 1)),
  cc_cliente_suma_saldo boolean NOT NULL DEFAULT false,
  incluir_en_mov_cc_cliente boolean NOT NULL DEFAULT false,
  cc_intermediario_signo smallint CHECK (cc_intermediario_signo IS NULL OR cc_intermediario_signo IN (-1, 0, 1)),
  cc_intermediario_suma_saldo boolean NOT NULL DEFAULT false,
  incluir_en_mov_cc_intermediario boolean NOT NULL DEFAULT false,
  concepto_leyenda text,
  usa_monto_efectivo boolean NOT NULL DEFAULT false,
  condicion_estado_comision text,
  cc_cliente_moneda_exposicion text CHECK (cc_cliente_moneda_exposicion IS NULL OR cc_cliente_moneda_exposicion IN ('orden_recibida', 'orden_entregada', 'transaccion')),
  cc_cliente_monto_referencia text CHECK (cc_cliente_monto_referencia IS NULL OR cc_cliente_monto_referencia IN ('mr', 'me', 'monto_transaccion')),
  cc_intermediario_moneda_exposicion text CHECK (cc_intermediario_moneda_exposicion IS NULL OR cc_intermediario_moneda_exposicion IN ('orden_recibida', 'orden_entregada', 'transaccion')),
  cc_intermediario_monto_referencia text CHECK (cc_intermediario_monto_referencia IS NULL OR cc_intermediario_monto_referencia IN ('mr', 'me', 'monto_transaccion', 'monto_efectivo_intermediario')),
  motor_suprime_espejo_egreso_mr boolean NOT NULL DEFAULT false,
  motor_merge_lookup_contrapartida boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT cc_modelo_reglas_estado_contrapartida_uniq UNIQUE (
    tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
    estado_transaccion, contrapartida_ejecutada, linea_motor
  )
);

CREATE INDEX IF NOT EXISTS idx_cc_modelo_reglas_tipo_usa
  ON public.cc_modelo_reglas (tipo_operacion_codigo, usa_intermediario);
CREATE INDEX IF NOT EXISTS idx_cc_modelo_reglas_estado
  ON public.cc_modelo_reglas (tipo_operacion_codigo, usa_intermediario, estado_transaccion, contrapartida_ejecutada);
CREATE INDEX IF NOT EXISTS idx_cc_modelo_reglas_incluir_cliente
  ON public.cc_modelo_reglas (tipo_operacion_codigo, usa_intermediario) WHERE incluir_en_mov_cc_cliente = true;
CREATE INDEX IF NOT EXISTS idx_cc_modelo_reglas_incluir_int
  ON public.cc_modelo_reglas (tipo_operacion_codigo, usa_intermediario) WHERE incluir_en_mov_cc_intermediario = true;

COMMENT ON TABLE public.cc_modelo_reglas IS 'Reglas CC: todas las combinaciones (estado transacción, contrapartida, signos, suma saldo, incluir en mov). Ver docs/CC_MODELO_TABLA_REGLAS.md.';
COMMENT ON COLUMN public.cc_modelo_reglas.estado_transaccion IS 'Estado de esta transacción: pendiente o ejecutada.';
COMMENT ON COLUMN public.cc_modelo_reglas.contrapartida_ejecutada IS 'True cuando la contrapartida del par (ej. Tx2 si hablamos de Tx1) está ejecutada; define si esta fila suma al saldo.';
COMMENT ON COLUMN public.cc_modelo_reglas.linea_motor IS '0, 1, …: varias filas con la misma clave lógica; el motor aplica todas ordenadas (varios movimientos CC por una transacción).';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_signo IS 'Multiplicador del monto en CC cliente: -1, 0 (no aplica), 1.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_suma_saldo IS 'Si true, este movimiento aporta al saldo CC cliente.';
COMMENT ON COLUMN public.cc_modelo_reglas.incluir_en_mov_cc_cliente IS 'Si true, se crea fila en movimientos_cuenta_corriente (solo cuando transacción ejecutada).';
COMMENT ON COLUMN public.cc_modelo_reglas.concepto_leyenda IS 'Clave para concepto: cobro_realizado, pago_realizado, compromiso_pago, comision_acuerdo.';
COMMENT ON COLUMN public.cc_modelo_reglas.usa_monto_efectivo IS 'Si true, usar monto con tasa descuento (ej. Int→Pandy 197k).';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_moneda_exposicion IS 'Moneda del movimiento CC cliente (orden_recibida|orden_entregada|transaccion). NULL = motor legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_monto_referencia IS 'Base del importe CC cliente: mr|me|monto_transaccion. NULL = inferir o legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_intermediario_moneda_exposicion IS 'Moneda del movimiento CC intermediario. NULL = motor legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_intermediario_monto_referencia IS 'Base importe CC int.; monto_efectivo_intermediario si aplica. NULL = legacy.';

-- ========== 2. ARS-ARS y CHEQUE en cc_modelo ==========
-- **ARS-ARS** ya no es tipo de operación en el catálogo (eliminado). No se insertan filas con ese código aquí.
-- **CHEQUE-ARS**: reglas solo en `reglas_de_negocio` (sql/migracion_reglas_de_negocio_cheque_ars.sql, docs/REGLAS_DE_NEGOCIO.md).
-- Bases que aún tengan filas legacy: ejecutar sql/migracion_cc_modelo_reglas_eliminar_ars_ars.sql (opcional).

UPDATE public.cc_modelo_reglas SET condicion_estado_comision = 'par_pandy_int'
WHERE pagador = 'pandy' AND cobrador = 'intermediario' AND tipo_transaccion = 'egreso' AND es_comision = true;

-- ========== 2b. Tipos activos SIN intermediario (ARS-USD, USD-USD, USD-ARS) ==========
-- Solo par cliente↔pandy: ingreso Cliente→Pandy y egreso Pandy→Cliente (4 combinaciones cada uno). CC intermediario no aplica (0, N, N).
-- Con par cerrado, ingreso (E,true): incluir Y para listar "Cobro Realizado" en Movimientos.

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
  -- Pendiente + contrapartida ejecutada (ej. Tx2 cerrada, Tx1 pendiente): deuda en moneda RECIBIDA (mr), no me en moneda entregada (evita anular USD con el compromiso del egreso en tipos dos monedas).
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true, true, 'compromiso_cobrar', false, 'orden_recibida', 'mr'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true, true, 'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true, true, 'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion'),
  -- Egreso pendiente con contrapartida ejecutada (Tx1 cerrada): incluir espejo en moneda recibida (+mr) solo en detalle para conciliar visualmente la moneda del cobro sin afectar saldo.
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

-- Comisión Pandy explícita en USD-USD sin intermediario.
-- En E,E (par cliente cerrado) suma saldo para compensar el cobro bruto -10000 con +300 de comisión y +9700 de egreso.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
) VALUES
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, false, true, 0, false, false, 'comision_acuerdo', false, 'transaccion', 'monto_transaccion', NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'transaccion', 'monto_transaccion', NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion', NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion', NULL, NULL)
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
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia,
  condicion_estado_comision = NULL;

-- ========== 2c. USD-ARS con intermediario (clon matriz ARS-ARS con intermediario; misma estructura que CHEQUE-ARS en reglas_de_negocio) ==========
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
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada
) DO NOTHING;

-- ========== 2d. USD-ARS con intermediario: Int->Cliente (egreso) ==========
-- Caso operativo donde el intermediario fondea y puede figurar como pagador hacia cliente.
-- Regla objetivo (pendiente + contrapartida ejecutada): espejo +mr en CC cliente (solo detalle)
-- y -me en CC intermediario (saldo + detalle).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
) VALUES
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', true,  1, false, true, -1, true, true, 'compromiso_pago', false, 'orden_recibida', 'mr', 'orden_entregada', 'me')
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

-- ========== 2e. USD-ARS con intermediario: ajuste E,P cliente/fondeo ==========
-- Cliente->Pandy ejecutada se expone en moneda entregada (me) para registrar deuda ARS del acuerdo.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  concepto_leyenda = 'cobro_realizado',
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_signo = -1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'intermediario'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- Pandy->Intermediario pendiente con contrapartida ejecutada:
-- +mr en detalle cliente (no saldo) y -me saldo+detalle en intermediario.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_recibida',
  cc_cliente_monto_referencia = 'mr',
  cc_intermediario_signo = -1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false;

-- Flujo inverso operativo (Cliente->Intermediario y Pandy->Cliente)
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_signo = 1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_recibida',
  cc_intermediario_monto_referencia = 'mr',
  concepto_leyenda = 'cobro_realizado'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_cobrar',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;

-- ========== 3. RLS (lectura para autenticados) ==========
ALTER TABLE public.cc_modelo_reglas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_modelo_reglas_select_authenticated" ON public.cc_modelo_reglas;
CREATE POLICY "cc_modelo_reglas_select_authenticated"
  ON public.cc_modelo_reglas FOR SELECT TO authenticated USING (true);
