-- Pandi – Tabla **reglas_de_negocio**: reglas explícitas de CC (y futuros dominios) por tipo de operación.
-- Sin intermediario: **USD-ARS**, **ARS-USD** y **USD-USD** (`usa_intermediario = false`).
-- Con intermediario: **USD-ARS** y **ARS-USD** (flujo inverso 2 tx C→Int + P→C), **USD-USD**, **CHEQUE-ARS** — todo en este archivo; scripts puntuales: `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql`, `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`, `sql/migracion_reglas_de_negocio_cheque_ars.sql`, `sql/migracion_reglas_cheque_ars_signos_cc_intermediario.sql`, `sql/migracion_usd_usd_intermediario_tipo_y_reglas.sql`.
-- Con intermediario: usar **entidad_cc** `cliente` | `intermediario` (ver `sql/migracion_reglas_de_negocio_entidad_cc.sql`).
-- Una fila = un movimiento CC cliente. Varios movimientos = varias filas (linea).
-- Varios movimientos de **transacción** (2..N) que suman el acuerdo: usar **monto_transaccion**,
-- **me_prorrateado** o **mr_prorrateado** (derivados de orden + monto de **esta** transacción), no repetir mr/me enteros por trx.
--
-- Orden sugerido:
-- 1) Este archivo en Supabase SQL Editor.
-- 2) Si venías de `cc_reglas_usd_ars`, ejecutá antes/alternativa: `sql/migracion_cc_reglas_usd_ars_a_reglas_de_negocio.sql`.
-- 3) Si la tabla ya existía sin `monto_origen = mr_menos_me` en el CHECK, ejecutá antes `sql/migracion_reglas_usd_usd_sin_int.sql` (o el ALTER del mismo) para ampliar la restricción; luego los INSERT de USD-USD.
-- 4) Desplegar front.
-- E,P USD-ARS / ARS-USD sin int. (cobro recibido ejecutado + entrega pendiente): ver `sql/migracion_usd_ars_ars_usd_ep_contra_moneda_recibida.sql` si ya tenías la matriz anterior.

CREATE TABLE IF NOT EXISTS public.reglas_de_negocio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_operacion_codigo text NOT NULL,
  usa_intermediario boolean NOT NULL DEFAULT false,
  pagador text NOT NULL CHECK (pagador IN ('cliente', 'pandy', 'intermediario')),
  cobrador text NOT NULL CHECK (cobrador IN ('cliente', 'pandy', 'intermediario')),
  tipo_transaccion text NOT NULL CHECK (tipo_transaccion IN ('ingreso', 'egreso')),
  es_comision boolean NOT NULL DEFAULT false,
  estado_transaccion text NOT NULL CHECK (estado_transaccion IN ('pendiente', 'ejecutada')),
  contrapartida_ejecutada boolean NOT NULL DEFAULT false,
  linea smallint NOT NULL DEFAULT 0,
  moneda text NOT NULL CHECK (moneda IN ('USD', 'ARS', 'EUR')),
  signo smallint NOT NULL CHECK (signo IN (-1, 1)),
  monto_origen text NOT NULL CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario',
    'comision_intermediario'
  )),
  incluir_en_detalle boolean NOT NULL DEFAULT true,
  concepto_leyenda text NOT NULL,
  condicion_estado_comision text,
  entidad_cc text NOT NULL DEFAULT 'cliente' CHECK (entidad_cc IN ('cliente', 'intermediario')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT reglas_de_negocio_uniq UNIQUE (
    tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
    estado_transaccion, contrapartida_ejecutada, linea
  )
);

CREATE INDEX IF NOT EXISTS idx_reglas_de_negocio_tipo_usa
  ON public.reglas_de_negocio (tipo_operacion_codigo, usa_intermediario);

COMMENT ON TABLE public.reglas_de_negocio IS 'Reglas de negocio → movimientos CC (y extensible). Ver docs/REGLAS_DE_NEGOCIO.md.';
COMMENT ON COLUMN public.reglas_de_negocio.tipo_operacion_codigo IS 'Catálogo tipos_operacion.codigo (p. ej. USD-ARS).';
COMMENT ON COLUMN public.reglas_de_negocio.monto_origen IS
  'mr/me: totales acuerdo (orden). monto_transaccion: esta trx. me_prorrateado: monto_tx_recibida * (me/mr). mr_prorrateado: monto_tx_entregada * (mr/me). mr_menos_me: comisión implícita USD-USD (mr − me). Permite N trx que suman el acuerdo.';
COMMENT ON COLUMN public.reglas_de_negocio.linea IS 'Orden cuando varias filas comparten la misma clave lógica.';

-- Instalaciones previas: columna y CHECK ampliado (monto_efectivo_intermediario; CHEQUE-ARS).
ALTER TABLE public.reglas_de_negocio ADD COLUMN IF NOT EXISTS condicion_estado_comision text;
COMMENT ON COLUMN public.reglas_de_negocio.condicion_estado_comision IS
  'Para es_comision=true: par_pandy_int | par_cliente | null (motor main.js).';
ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_monto_origen_check;
ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_monto_origen_check CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario',
    'comision_intermediario'
  ));

-- USD-ARS sin intermediario (mr USD, me ARS). Prorrateos alineados a tests COMBINACIONES_USD_ARS.
-- E,P (ingreso ejecutado, egreso pendiente): en moneda **recibida** (USD) el cobro en Trx1 va en par cerrado (−monto_transacción + contra en la misma Trx1) → saldo neto USD 0; el compromiso de entrega queda solo en **ARS** en Trx2 pendiente (no fila USD pendiente en egreso).
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'contra_cobro_entrega_pendiente'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me_prorrateado', true, 'cobro_realizado'),
  -- E,E: con par ejecutado, ingreso usa contrapartida true → hace falta también la pata USD (igual que rama false) para netear con el +USD del egreso ejecutado true.
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  -- P,E: egreso Tx2 ejecutado con ingreso Tx1 pendiente → contrapartida_ejecutada=false. **Dos líneas ARS** −/+ `monto_transaccion` anulan el egreso en CC (misma definición que ARS-USD con dos USD y que USD-USD P,E). Queda el compromiso **USD** pendiente en Tx1. Definición de producto: lo ejecutado siempre en par ±; lo pendiente, una sola línea con su signo.
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  -- E,E (Tx1 y Tx2 ejecutadas, contrapartida true): **dos líneas por transacción** (ingreso: ARS+USD; egreso: ARS+USD) → 4 movimientos que se anulan por moneda (saldo 0 USD y 0 ARS). Ver docs/MODELO_CC_USD_ARS_TEORICO.md.
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- USD-ARS con intermediario — flujo inverso (2 tx: Cliente→Intermediario, Pandy→Cliente). Ver docs/REG_NEG_USD_ARS_INT_PASO1.md
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 2, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'ARS', 1, 'me', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 1, 'USD', 1, 'mr', true, 'compromiso_cobrar'),
  -- P,E: ingreso pendiente aporta +me ARS (compromiso_cobrar); egreso ejecutado con contrapartida false debe −me para anular. E,E: ingreso ejecutado aporta −me en cobro_realizado; esta misma fila no aplica (va la de contrapartida true con signo +1).
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'me', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- USD-ARS + int, patrón **cp_ic** (ingreso Cliente→Pandy USD, egreso Intermediario→Cliente ARS). Espejo de ARS-USD+int cp_ic con monedas invertidas (mr USD, me ARS).
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-ARS', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'ARS', -1, 'me', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- ARS-USD sin intermediario (mr ARS, me USD). Espejo de USD-ARS: E,P → par ARS cerrado en Trx1 + compromiso USD pendiente en Trx2.
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'contra_cobro_entrega_pendiente'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  -- P,E: egreso Tx2 ejecutado con ingreso Tx1 pendiente (contrapartida false): dos líneas USD −me/+me anulan el doble registro del egreso en CC; el saldo queda solo en ARS (−mr compromiso pendiente). Espejo de USD-USD egreso ejecutada false (dos líneas misma moneda).
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- ARS-USD con intermediario — flujo inverso (2 tx: Cliente→Intermediario en ARS, Pandy→Cliente en USD). Ver docs/REG_NEG_ARS_USD_INT_PASO1.md
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 2, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'intermediario', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'ARS', 1, 'mr', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'me', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 1, 'ARS', 1, 'mr', true, 'compromiso_cobrar'),
  -- Espejo USD-ARS+int: P,E anula +me USD pendiente con −me en egreso (solo contrapartida false).
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- ARS-USD + int, patrón **cp_ic** (ingreso Cliente→Pandy ARS, egreso Intermediario→Cliente USD). El panel de órdenes usaba este patrón por defecto; sin estas filas el motor no matcheaba (solo existía ci_pc arriba). Alineado a USD-USD+int cp_ic con mr/me en monedas del acuerdo.
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'mr', true, 'compromiso_pago'),
  ('ARS-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- USD-USD sin int (comisión implícita mr − me; ver docs/USD_USD_SIN_INTERMEDIARIO.md)
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  -- P,E: ingreso pendiente +monto_transacción (cliente nos debe). Egreso ejecutado: −/+ monto_transacción anula pago Pandy; saldo neto +mr.
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
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

-- USD-USD con intermediario: misma matriz cliente que sin int + comisión intermediario (`comision_intermediario`; ver docs/USD_USD_CON_INTERMEDIARIO.md)
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  -- Ingreso Cliente→Intermediario (patrón alternativo USD-USD+int; misma matriz que cobro a Pandy).
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-USD', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  -- Misma matriz de egreso cuando la pata de entrega es Intermediario→Cliente (instrumentación canónica USD-USD+int).
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'intermediario', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  -- CC intermediario (cp_ic): cuando el intermediario paga al cliente, Pandy debe al int. el me entregado + la comisión explícita (fila es_comision aparte). Solo estados ejecutada (sin filas pendiente) para no cargar deuda antes de ejecutar Tx2.
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  -- ci_pc: CC intermediario por egreso Pandy→Cliente (misma lógica de líneas que entidad cliente; cp_ic no tiene esta pata).
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago'),
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true, 0, 'USD', 1, 'mr_menos_me', true, 'comision_acuerdo'),
  ('USD-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', -1, 'comision_intermediario', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- CHEQUE-ARS con intermediario (matriz; única fuente CC; motor `aplicarMotorCcDesdeReglasDeNegocio` en main.js)
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  -- CC intermediario: signos desde situación Pandy (ver docs/CHEQUE_ARS_INTERMEDIARIO.md). +Tx3 cheque = lo que el int debe reconocer; −comisión; −Tx4 efectivo = pago al cierre.
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'pendiente', true, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', true, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int')
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

-- `cc_modelo_reglas` ya no se usa: la app solo lee `reglas_de_negocio`. Para dropear la tabla en DB: `sql/migracion_drop_cc_modelo_reglas.sql`.
-- Backup / histórico del modelo anterior: `sql/archive/cc_modelo_legacy/` (snapshot JSON en `snapshots/`).

ALTER TABLE public.reglas_de_negocio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reglas_de_negocio_select_authenticated" ON public.reglas_de_negocio;
CREATE POLICY "reglas_de_negocio_select_authenticated"
  ON public.reglas_de_negocio FOR SELECT TO authenticated USING (true);
