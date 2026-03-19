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
  cc_cliente_signo smallint CHECK (cc_cliente_signo IS NULL OR cc_cliente_signo IN (-1, 0, 1)),
  cc_cliente_suma_saldo boolean NOT NULL DEFAULT false,
  incluir_en_mov_cc_cliente boolean NOT NULL DEFAULT false,
  cc_intermediario_signo smallint CHECK (cc_intermediario_signo IS NULL OR cc_intermediario_signo IN (-1, 0, 1)),
  cc_intermediario_suma_saldo boolean NOT NULL DEFAULT false,
  incluir_en_mov_cc_intermediario boolean NOT NULL DEFAULT false,
  concepto_leyenda text,
  usa_monto_efectivo boolean NOT NULL DEFAULT false,
  condicion_estado_comision text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada)
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
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_signo IS 'Multiplicador del monto en CC cliente: -1, 0 (no aplica), 1.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_suma_saldo IS 'Si true, este movimiento aporta al saldo CC cliente.';
COMMENT ON COLUMN public.cc_modelo_reglas.incluir_en_mov_cc_cliente IS 'Si true, se crea fila en movimientos_cuenta_corriente (solo cuando transacción ejecutada).';
COMMENT ON COLUMN public.cc_modelo_reglas.concepto_leyenda IS 'Clave para concepto: cobro_realizado, pago_realizado, compromiso_pago, comision_acuerdo.';
COMMENT ON COLUMN public.cc_modelo_reglas.usa_monto_efectivo IS 'Si true, usar monto con tasa descuento (ej. Int→Pandy 197k).';

-- ========== 2. Datos: todas las combinaciones ARS-ARS / CHEQUE-ARS con intermediario ==========
-- Por cada tipo de transacción: 4 filas (estado_transaccion × contrapartida_ejecutada).
-- Orden: (ejecutada, false), (ejecutada, true), (pendiente, false), (pendiente, true).

-- Helper: insertar 4 combinaciones para (pagador, cobrador, tipo_tx, es_comision) con valores dados.
-- Tx1: Cliente→Pandy ingreso (no comisión)
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 0, false, false, 'cobro_realizado', false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 0, false, false, 'cobro_realizado', false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 0, false, false, 'cobro_realizado', false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 0, false, false, 'cobro_realizado', false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- Tx2: Pandy→Cliente egreso (no comisión). Pendiente + contrapartida ejecutada = SUMA SALDO Y.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 0, false, false, 'compromiso_pago', false),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 0, false, false, 'compromiso_pago', false),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, true, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 0, false, false, 'compromiso_pago', false),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 0, false, false, 'compromiso_pago', false),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, true, false, 0, false, false, NULL, false)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- Tx3: Pandy→Intermediario egreso (no comisión)
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, 1, false, true, 'pago_realizado', false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, 1, false, true, 'pago_realizado', false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, 1, false, true, 'pago_realizado', false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, 1, false, true, 'pago_realizado', false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, 0, false, false, NULL, false)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- Tx4: Intermediario→Pandy ingreso (no comisión). Pendiente + contrapartida ejecutada = SUMA SALDO Y.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false, -1, false, true, 'cobro_realizado', true),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false, -1, false, true, 'cobro_realizado', true),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, true),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, -1, true, false, NULL, true),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false, -1, false, true, 'cobro_realizado', true),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false, -1, false, true, 'cobro_realizado', true),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, true),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, -1, true, false, NULL, true)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- Comisión Pandy: Cliente→Pandy ingreso, es_comision true (solo ejecutada tiene sentido para incluir)
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, -1, false, true, 0, false, false, 'comision_acuerdo', false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  -1, false, true, 0, false, false, 'comision_acuerdo', false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, -1, false, true, 0, false, false, 'comision_acuerdo', false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  -1, false, true, 0, false, false, 'comision_acuerdo', false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  0, false, false, 0, false, false, NULL, false)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- Comisión Intermediario: Pandy→Intermediario egreso, es_comision true
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
) VALUES
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false, -1, false, true, 'comision_acuerdo', false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false, -1, false, true, 'comision_acuerdo', false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false, -1, false, true, 'comision_acuerdo', false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false, -1, false, true, 'comision_acuerdo', false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false, 0, false, false, NULL, false),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false, 0, false, false, NULL, false)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

UPDATE public.cc_modelo_reglas SET condicion_estado_comision = 'par_pandy_int'
WHERE pagador = 'pandy' AND cobrador = 'intermediario' AND tipo_transaccion = 'egreso' AND es_comision = true;

-- ========== 2b. Tipos activos SIN intermediario (ARS-USD, USD-USD, USD-ARS) ==========
-- Solo par cliente↔pandy: ingreso Cliente→Pandy y egreso Pandy→Cliente (4 combinaciones cada uno). CC intermediario no aplica (0, N, N).
-- Misma lógica de signos e incluir/suma_saldo que el par cliente en ARS-ARS.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
)
SELECT codigo, false, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  0, false, false,
  concepto_leyenda, usa_monto_efectivo
FROM (VALUES
  ('ARS-USD'), ('USD-USD'), ('USD-ARS')
) AS t(codigo)
CROSS JOIN (VALUES
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, true, false, NULL, false)
) AS r(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente, concepto_leyenda, usa_monto_efectivo)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;

-- ========== 3. RLS (lectura para autenticados) ==========
ALTER TABLE public.cc_modelo_reglas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_modelo_reglas_select_authenticated" ON public.cc_modelo_reglas;
CREATE POLICY "cc_modelo_reglas_select_authenticated"
  ON public.cc_modelo_reglas FOR SELECT TO authenticated USING (true);
