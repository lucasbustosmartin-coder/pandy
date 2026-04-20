-- Fase 0: tipo ENUM + columnas con DEFAULT seguro para producción.
-- Idempotente en lo posible (IF NOT EXISTS / DO duplicate_object).
-- Orden: 1) este archivo en SQL Editor 2) volver a aplicar sql/rpc_sync_cc_caja_orden.sql

DO $$
BEGIN
  CREATE TYPE public.movimiento_clasificacion AS ENUM (
    'LEGACY_SIN_CLASIFICAR',
    'CC_FLUJO_OPERATIVO_TRX',
    'CC_COMISION_ACUERDO',
    'CC_COMPENSACION',
    'CC_COMISION_SINTETICA_SIN_TRX',
    'REGULA_B_MONR_MONE_PRESTAMO',
    'CIERRE_ORDEN_MULTIMONEDA',
    'CC_RESULTADO_ECONOMICO_COMPENSATORIO',
    'CANCELACION_CONTRAPARTE',
    'SALDO_INICIAL_VOLCADO',
    'MANUAL_EXPLICITO',
    'CAJA_FLUJO_OPERATIVO',
    'CAJA_COMISION_ACUERDO',
    'EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO'
  );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

COMMENT ON TYPE public.movimiento_clasificacion IS
  'Clasificación cerrada de movimientos CC/caja y de transacciones. LEGACY_SIN_CLASIFICAR es transitorio hasta backfill completo.';

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS clasificacion_movimiento public.movimiento_clasificacion
    NOT NULL DEFAULT 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS clasificacion_movimiento public.movimiento_clasificacion
    NOT NULL DEFAULT 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS clasificacion_movimiento public.movimiento_clasificacion
    NOT NULL DEFAULT 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS clasificacion_transaccion public.movimiento_clasificacion
    NOT NULL DEFAULT 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.clasificacion_movimiento IS
  'Tipo de movimiento para lógica y reportes; concepto sigue siendo texto humano.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.clasificacion_movimiento IS
  'Tipo de movimiento para lógica y reportes; concepto sigue siendo texto humano.';
COMMENT ON COLUMN public.movimientos_caja.clasificacion_movimiento IS
  'Tipo de movimiento para lógica y reportes; concepto sigue siendo texto humano.';
COMMENT ON COLUMN public.transacciones.clasificacion_transaccion IS
  'Clasificación de la transacción (mismo ENUM que movimientos); obligatoria, default legado hasta backfill.';

CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente_clasif_fecha
  ON public.movimientos_cuenta_corriente (clasificacion_movimiento, fecha);

CREATE INDEX IF NOT EXISTS idx_mov_cc_int_clasif_fecha
  ON public.movimientos_cuenta_corriente_intermediario (clasificacion_movimiento, fecha);

CREATE INDEX IF NOT EXISTS idx_mov_caja_clasif_fecha
  ON public.movimientos_caja (clasificacion_movimiento, fecha);

CREATE INDEX IF NOT EXISTS idx_transacciones_clasificacion
  ON public.transacciones (clasificacion_transaccion);
