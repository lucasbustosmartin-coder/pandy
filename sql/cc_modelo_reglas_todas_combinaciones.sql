-- =============================================================================
-- REGLAS CC: ejecutar TODO este archivo en Supabase SQL Editor.
-- Abrís sql/cc_modelo_reglas_todas_combinaciones.sql, copiás todo y pegás en el
-- editor de Supabase, luego Run. Es autocontenido: el §0 crea/ampliá linea_motor + UNIQUE.
-- Antes del test E2E: este script y luego sql/truncar_ordenes_transacciones.sql si querés limpio.
-- =============================================================================
--
-- Matriz completa CC (excepto USD-ARS, ARS-USD y USD-USD sin intermediario → sql/reglas_de_negocio_tabla.sql).
-- Cada tipo en este archivo: 4 filas base (estado_transaccion × contrapartida_ejecutada) salvo extensiones documentadas.
-- Lookup: (pagador, cobrador, tipo, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor).
-- Varias filas con la misma clave lógica y distinto linea_motor (0, 1, …) = varios movimientos CC desde tabla.
-- Con la tabla bien cargada, cualquier combinación E/P de Tx1..Tx4 sale sola.
--
-- CLIENTE: detalle = saldo. Tx1 -200k (suma/incluir según fila), Tx2 +195k, Comisión +5k.
-- INTERMEDIARIO: detalle = solo 2 líneas: Tx3 -200k, Tx4 +197k. Saldo = -200k+197k = -3k. Comisión no es línea.
--
-- Tx1: (E,false)=Tx2 P: -1,Y,Y. (E,true)=par cerrado: -1,Y,N. (P,false): 0,N,N. (P,true): -1,Y,N.
-- Tx2: (E,false)=Tx1 P: 1,Y,Y. (E,true)=par cerrado: 1,N,Y. (P,false): 0,N,N. (P,true): 1,N,N.
-- Tx3: (E,false),(E,true): -1,Y,Y. (P,false),(P,true): -1,Y,Y. [todas escriben -200k]
-- Tx4: (E,false),(E,true): 1,Y,Y. (P,false),(P,true): 1,Y,Y. [todas escriben +197k, usa_monto_efectivo]
-- Comisión Pandy: 4 filas: 1,N,Y (cliente). Comisión Int: 4 filas: -1,N,N (no línea en detalle int).
-- Ejecutar en Supabase SQL Editor.

-- ========== 0. Columna linea_motor y UNIQUE (idempotente) ==========
-- Sin esto, los INSERT/ON CONFLICT con linea_motor fallan.

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS linea_motor smallint NOT NULL DEFAULT 0;

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS motor_suprime_espejo_egreso_mr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motor_merge_lookup_contrapartida boolean NOT NULL DEFAULT false;

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

-- ========== 1. Con intermediario: ARS-ARS y CHEQUE-ARS ==========

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision
) VALUES
-- Tx1: Cliente→Pandy ingreso. (P,true)=cliente aún no pagó, Tx2=E: NO sumar para que saldo cliente = +200k (debe 200k); detalle = +195k+5k.
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, false, false, 0, false, false, NULL, false, NULL),
-- Tx2: Pandy→Cliente egreso. Par cerrado (E,true): SUMA Y e INCLUIR Y para que saldo = -200k+195k+5k = 0.
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
-- Tx3: suma al saldo (-200k). En detalle: (E,false) y (P,true) SÍ incluir (nominal -200k para E,E,E,P y E,E,P,E).
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, -1, false, false, NULL, false, NULL),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, -1, true,  true,  NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, -1, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, -1, true,  true,  NULL, false, NULL),
-- Tx4: Par cerrado (E,true) SUMA Y e INCLUIR. (E,false) no incluir para E,E,P,E (detalle solo Tx3 -200k + comisión).
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false,  1, false, false, 'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false,  1, true,  true,  'cobro_realizado', true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false,  1, false, false, NULL, true, NULL),
  ('ARS-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false,  1, false, false, 'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false,  1, true,  true,  'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false,  1, false, false, NULL, true, NULL),
-- Comisión Pandy: condicion_estado_comision = par_cliente (ejecutada si par cerrado O Tx2 ejecutada; así P,E,P,P suma +5k y saldo 200k).
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'par_cliente'),
  ('ARS-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, true,  true, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, true,  true, 0, false, false, NULL, false, 'par_cliente'),
-- Comisión Intermediario: Par cerrado (E,true) SUMA Y para saldo int = 0. (P,true) también SUMA Y para E,E,E,P: saldo -200k+3k = -197k.
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false,  1, false, true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false,  1, true,  true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false,  1, false, false, NULL, false, 'par_pandy_int'),
  ('ARS-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false,  1, true,  true,  NULL, false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false,  1, false, true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false,  1, true,  true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false,  1, false, false, NULL, false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false,  1, true,  true,  NULL, false, 'par_pandy_int')
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
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;

-- ========== 2. Sin intermediario: USD-ARS (histórico catálogo; USD-USD sin int → sql/reglas_de_negocio_tabla.sql) ==========
-- USD-ARS, ARS-USD y USD-USD sin intermediario viven en `reglas_de_negocio`. No insertar aquí esas filas false.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
)
SELECT codigo, false, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  0::smallint, false, false,
  concepto_leyenda, usa_monto_efectivo,
  cli_mon_exp,
  cli_monto_ref,
  NULL::text, NULL::text,
  0::smallint
FROM (VALUES ('USD-ARS')) AS t(codigo)
CROSS JOIN (VALUES
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  'cobro_realizado', false, 'orden_entregada'::text, 'me'::text),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true, 'cobro_realizado', false, 'orden_entregada', 'me'),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false, 'orden_entregada', 'me'),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, true,  true, 'compromiso_cobrar', false, 'orden_recibida', 'mr'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true, true,  'compromiso_pago', false, 'transaccion', 'monto_transaccion'),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion'),
  -- Egreso pendiente con contrapartida ejecutada (Tx1 cerrada): incluir espejo en moneda recibida (+mr) solo en detalle para conciliar visualmente la moneda del cobro sin afectar saldo.
  ('pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, true, 'compromiso_pago', false, 'orden_recibida', 'mr')
) AS r(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente, concepto_leyenda, usa_monto_efectivo, cli_mon_exp, cli_monto_ref)
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
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

-- ========== 3. USD-ARS con intermediario (misma matriz que CHEQUE-ARS con intermediario) ==========
-- Punto de partida para catálogo con dos filas USD-ARS (sin/con intermediario). Calibrar según negocio.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  condicion_estado_comision,
  linea_motor
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
  r.condicion_estado_comision,
  r.linea_motor
FROM public.cc_modelo_reglas r
WHERE r.tipo_operacion_codigo = 'CHEQUE-ARS'
  AND r.usa_intermediario = true
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
) DO NOTHING;

-- ========== 4. USD-ARS con intermediario: Int->Cliente (egreso) ==========
-- Pendiente + contrapartida ejecutada: +mr en CC cliente (solo detalle) y -me en CC intermediario (saldo+detalle).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
)
VALUES
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', true,  1, false, true, -1, true, true, 'compromiso_pago', false, 'orden_recibida', 'mr', 'orden_entregada', 'me')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
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

-- ========== 5. USD-ARS con intermediario: ajuste E,P cliente/fondeo ==========
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

-- P,E (inverso E,P): ingreso pendiente linea_motor 0 — −me ARS (anula con egreso ejecutado +me → saldo ARS 0). linea_motor 1 — −mr USD (INSERT abajo).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
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
  AND contrapartida_ejecutada = true
  AND COALESCE(linea_motor, 0) = 0;

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

-- E,P: egreso pendiente línea 0 — NO volver a sumar −me en CC cliente: el ingreso ejecutado Cliente→Intermediario (A) ya registró −me ARS; duplicar aquí daba −10M ARS. La pata USD del ingreso se netea con linea_motor = 1 (−mr USD, suma sin detalle).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = false,
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
  AND contrapartida_ejecutada = true
  AND COALESCE(linea_motor, 0) = 0;

-- E,P: segunda línea motor (−mr USD) — legado: antes sumaba al saldo para “netear” +mr USD que ya no se modela así en CC cliente (ingreso solo suma −me ARS). Si suma=true queda saldo USD −5000 sin contrapartida en saldo → “debe USD” mal. cc_cliente_suma_saldo=false (detalle/ajustes vía espejos en main.js).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,
  -1, false, false,
  0, false, false,
  'compromiso_pago', false,
  'orden_recibida', 'mr',
  NULL, NULL,
  1
)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
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

-- P,E: ingreso pendiente línea 1 — −mr USD en CC cliente (debe USD; main.js omite espejo +mr en egreso Pandy→Cliente ejecutado).
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,
  -1, true, true,
  0, false, false,
  'compromiso_cobrar', false,
  'orden_recibida', 'mr',
  NULL, NULL,
  1
)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
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

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  condicion_estado_comision,
  linea_motor
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
  r.condicion_estado_comision,
  r.linea_motor
FROM public.cc_modelo_reglas r
WHERE r.tipo_operacion_codigo = 'ARS-ARS'
  AND r.usa_intermediario = true
  AND NOT EXISTS (
    SELECT 1 FROM public.cc_modelo_reglas z
    WHERE z.tipo_operacion_codigo = 'USD-ARS' AND z.usa_intermediario = true
  )
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
) DO NOTHING;

-- ========== 6. ARS-USD con intermediario (flujo inverso operativo) ==========
-- P,E: ingreso pendiente (−me USD compromiso + −mr ARS línea 1) + egreso ejecutado (contrapartida_ejecutada=false).
--   El +me del egreso netea USD con el −me del ingreso; incluir cliente true en el egreso para ver ambas patas en USD en detalle.
--   Sin espejo +mr ARS en main.js si el ingreso C→Int sigue pendiente: la deuda ARS (−mr) no se “anula” hasta ejecutar ese ingreso.
--   CC intermediario: +me USD en la misma fila de egreso (lo que Pandy pagó).
-- E,E: usa la fila egreso ejecutada con contrapartida_ejecutada=true (sin este ajuste de intermediario en la fila false).
-- Misma semántica base que sql/migracion_cc_modelo_reglas_ars_usd_intermediario_flujo_inverso_operativo.sql + linea_motor.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
) VALUES
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true,  -1, true, true,  1, true, true, 'cobro_realizado', false, 'orden_entregada', 'me', 'orden_recibida', 'mr'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,  -1, true, true,   0, false, false, 'compromiso_cobrar', false, 'orden_entregada', 'me', NULL, NULL),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false,  1, true, true,  1, true, true, 'compromiso_pago', false, 'orden_entregada', 'me', 'orden_entregada', 'me'),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,   1, true, true, 0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('ARS-USD', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  -1, true, true,  0, false, false, 'compromiso_pago', false, 'orden_entregada', 'me', NULL, NULL)
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
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

-- Segunda fila misma clave lógica (linea_motor = 1): CC cliente −mr en moneda recibida.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'ARS-USD', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,
  -1, true, true, 0, false, false, 'compromiso_cobrar', false, 'orden_recibida', 'mr', NULL, NULL,
  1
)
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
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;
