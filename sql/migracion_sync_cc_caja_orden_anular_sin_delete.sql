-- Capa 1: un vivo por clave lógica (CC cliente, CC intermediario, caja derivada).
-- Los gemelos previos deben estar ANULADOS (no borrados) antes de crear el índice.
-- El cuerpo de sync_cc_caja_orden (INSERT/UPDATE/ANULAR, sin DELETE) está en
-- sql/rpc_sync_cc_caja_orden.sql — reaplicar ese script junto con esta migración.

CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_cc_cli_vivo_clave
ON public.movimientos_cuenta_corriente (
  orden_id,
  cliente_id,
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(transaccion_numero, -1),
  upper(trim(moneda)),
  monto,
  clasificacion_movimiento,
  left(COALESCE(concepto, ''), 72)
)
WHERE COALESCE(es_movimiento_manual, false) = false
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_cc_int_vivo_clave
ON public.movimientos_cuenta_corriente_intermediario (
  orden_id,
  intermediario_id,
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(transaccion_numero, -1),
  upper(trim(moneda)),
  monto,
  clasificacion_movimiento,
  left(COALESCE(concepto, ''), 72)
)
WHERE COALESCE(es_movimiento_manual, false) = false
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_caja_derivado_vivo_clave
ON public.movimientos_caja (
  COALESCE(orden_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(transaccion_numero, -1),
  COALESCE(orden_numero, -1),
  upper(trim(moneda)),
  monto,
  COALESCE(caja_tipo, 'efectivo'),
  clasificacion_movimiento,
  left(COALESCE(concepto, ''), 72)
)
WHERE tipo_movimiento_id IS NULL
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

COMMENT ON INDEX public.uq_mov_cc_cli_vivo_clave IS
  'Un movimiento CC cliente vivo (no anulado, no manual) por clave lógica del sync.';
COMMENT ON INDEX public.uq_mov_cc_int_vivo_clave IS
  'Un movimiento CC intermediario vivo (no anulado, no manual) por clave lógica del sync.';
COMMENT ON INDEX public.uq_mov_caja_derivado_vivo_clave IS
  'Un movimiento de caja derivado vivo (sin tipo_movimiento_id, no anulado) por clave lógica del sync.';
