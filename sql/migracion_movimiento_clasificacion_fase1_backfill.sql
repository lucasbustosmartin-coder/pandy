-- Fase 1: backfill de clasificacion_movimiento / clasificacion_transaccion desde patrones de concepto
-- y flags (manual, transaccion_id). Idempotente: solo toca filas en LEGACY_SIN_CLASIFICAR.
-- Despliegue referencia: aplicado Supabase dev + producción (2026-04-17); estado vivo en docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md.
--
-- Precondiciones:
--   1) sql/migracion_movimiento_clasificacion_fase0_ddl.sql ya aplicada.
--   2) Helpers G/P: public.gp_concepto_es_linea_comision_cc_gp y public.gp_concepto_es_comision_caja_ordenes_gp
--      (sql/migracion_gp_operativa_panel.sql o equivalente).
--
-- Orden de capas: de más específico a más general; el último UPDATE de CC agota casi todo lo ligado a orden/transacción.
-- Ejecutar en SQL Editor (dev primero, luego prod). Revisar bloque «Verificación» al final.

-- ========== CC cliente ==========

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'MANUAL_EXPLICITO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = true;

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_COMPENSACION'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Compensación parcial en cuenta corriente-%'
    OR COALESCE(m.concepto, '') ILIKE '%Compensación total en cuenta corriente-%'
    OR COALESCE(m.concepto, '') ILIKE '%Compensación parcial o total%'
  );

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CANCELACION_CONTRAPARTE'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Cancelación de deuda%'
    OR COALESCE(m.concepto, '') ILIKE '%Contraparte cancelación%'
  );

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Trazabilidad transacción anulada%';

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CIERRE_ORDEN_MULTIMONEDA'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Cierre orden %';

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'REGULA_B_MONR_MONE_PRESTAMO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Préstamo al cliente (cobertura Pandy%'
    OR COALESCE(m.concepto, '') ILIKE '%Prestamo al cliente (cobertura Pandy%'
    OR COALESCE(m.concepto, '') ILIKE '%cobertura Pandy — moneda recibida%'
    OR COALESCE(m.concepto, '') ILIKE '%cobertura Pandy - moneda recibida%'
  );

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_COMISION_SINTETICA_SIN_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND m.transaccion_id IS NULL
  AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''));

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_COMISION_ACUERDO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND m.transaccion_id IS NOT NULL
  AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''));

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'SALDO_INICIAL_VOLCADO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Saldo inicial%';

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE 'Cobro Realizado%'
    OR COALESCE(m.concepto, '') ILIKE 'Pago Realizado%'
    OR COALESCE(m.concepto, '') ILIKE 'Compromiso de Pago%'
    OR COALESCE(m.concepto, '') ILIKE 'Compromiso a Cobrar%'
    OR COALESCE(m.concepto, '') ILIKE 'Contra cobro (entrega pendiente)%'
    OR COALESCE(m.concepto, '') ILIKE 'Movimiento - Orden %'
    OR COALESCE(m.concepto, '') ILIKE 'Cobro por%'
    OR COALESCE(m.concepto, '') ILIKE 'Deuda por%'
    OR COALESCE(m.concepto, '') ILIKE 'Pago por%'
  );

UPDATE public.movimientos_cuenta_corriente m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (m.orden_id IS NOT NULL OR m.transaccion_id IS NOT NULL);

-- ========== CC intermediario (mismas capas salvo saldo inicial volcado, poco usado en int.) ==========

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'MANUAL_EXPLICITO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = true;

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_COMPENSACION'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Compensación parcial en cuenta corriente-%'
    OR COALESCE(m.concepto, '') ILIKE '%Compensación total en cuenta corriente-%'
    OR COALESCE(m.concepto, '') ILIKE '%Compensación parcial o total%'
  );

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CANCELACION_CONTRAPARTE'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Cancelación de deuda%'
    OR COALESCE(m.concepto, '') ILIKE '%Contraparte cancelación%'
  );

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Trazabilidad transacción anulada%';

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CIERRE_ORDEN_MULTIMONEDA'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Cierre orden %';

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'REGULA_B_MONR_MONE_PRESTAMO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE '%Préstamo al cliente (cobertura Pandy%'
    OR COALESCE(m.concepto, '') ILIKE '%Prestamo al cliente (cobertura Pandy%'
    OR COALESCE(m.concepto, '') ILIKE '%cobertura Pandy — moneda recibida%'
    OR COALESCE(m.concepto, '') ILIKE '%cobertura Pandy - moneda recibida%'
  );

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_COMISION_SINTETICA_SIN_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND m.transaccion_id IS NULL
  AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''));

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_COMISION_ACUERDO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND m.transaccion_id IS NOT NULL
  AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''));

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'SALDO_INICIAL_VOLCADO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.concepto, '') ILIKE 'Saldo inicial%';

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (
    COALESCE(m.concepto, '') ILIKE 'Cobro Realizado%'
    OR COALESCE(m.concepto, '') ILIKE 'Pago Realizado%'
    OR COALESCE(m.concepto, '') ILIKE 'Compromiso de Pago%'
    OR COALESCE(m.concepto, '') ILIKE 'Compromiso a Cobrar%'
    OR COALESCE(m.concepto, '') ILIKE 'Contra cobro (entrega pendiente)%'
    OR COALESCE(m.concepto, '') ILIKE 'Movimiento - Orden %'
    OR COALESCE(m.concepto, '') ILIKE 'Cobro por%'
    OR COALESCE(m.concepto, '') ILIKE 'Deuda por%'
    OR COALESCE(m.concepto, '') ILIKE 'Pago por%'
    OR COALESCE(m.concepto, '') ILIKE 'Comisión Intermediario%'
    OR COALESCE(m.concepto, '') ILIKE 'Comision Intermediario%'
    OR COALESCE(m.concepto, '') ILIKE 'Pandy a Intermediario%'
    OR COALESCE(m.concepto, '') ILIKE 'Intermediario debe a Pandy%'
    OR COALESCE(m.concepto, '') ILIKE 'Pago Intermediario a Pandy%'
  );

UPDATE public.movimientos_cuenta_corriente_intermediario m
SET clasificacion_movimiento = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND (m.orden_id IS NOT NULL OR m.transaccion_id IS NOT NULL);

-- ========== Caja ==========

UPDATE public.movimientos_caja m
SET clasificacion_movimiento = 'MANUAL_EXPLICITO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND m.tipo_movimiento_id IS NOT NULL;

UPDATE public.movimientos_caja m
SET clasificacion_movimiento = 'CAJA_COMISION_ACUERDO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND public.gp_concepto_es_comision_caja_ordenes_gp(COALESCE(m.concepto, ''));

UPDATE public.movimientos_caja m
SET clasificacion_movimiento = 'CAJA_FLUJO_OPERATIVO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND (
    COALESCE(m.concepto, '') ILIKE 'Ganancia del acuerdo%'
    OR COALESCE(m.concepto, '') ILIKE 'Ingreso de %'
    OR COALESCE(m.concepto, '') ILIKE 'Egreso de %'
  );

UPDATE public.movimientos_caja m
SET clasificacion_movimiento = 'CAJA_FLUJO_OPERATIVO'::public.movimiento_clasificacion
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
  AND (m.orden_id IS NOT NULL OR m.transaccion_id IS NOT NULL);

-- ========== Transacciones (clasificación gruesa operativa) ==========

UPDATE public.transacciones t
SET clasificacion_transaccion = 'CC_FLUJO_OPERATIVO_TRX'::public.movimiento_clasificacion
WHERE t.clasificacion_transaccion = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;

-- ========== Verificación (solo lectura; revisar conteos y muestras de LEGACY) ==========

SELECT 'movimientos_cuenta_corriente' AS tabla, m.clasificacion_movimiento, count(*)::bigint AS n
FROM public.movimientos_cuenta_corriente m
GROUP BY m.clasificacion_movimiento
ORDER BY n DESC;

SELECT 'movimientos_cuenta_corriente_intermediario' AS tabla, m.clasificacion_movimiento, count(*)::bigint AS n
FROM public.movimientos_cuenta_corriente_intermediario m
GROUP BY m.clasificacion_movimiento
ORDER BY n DESC;

SELECT 'movimientos_caja' AS tabla, m.clasificacion_movimiento, count(*)::bigint AS n
FROM public.movimientos_caja m
GROUP BY m.clasificacion_movimiento
ORDER BY n DESC;

SELECT 'transacciones' AS tabla, t.clasificacion_transaccion, count(*)::bigint AS n
FROM public.transacciones t
GROUP BY t.clasificacion_transaccion
ORDER BY n DESC;

SELECT 'cc_cliente_LEGACY_muestra' AS q, m.id, m.orden_id, m.transaccion_id, left(COALESCE(m.concepto, ''), 100) AS concepto_pref
FROM public.movimientos_cuenta_corriente m
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
ORDER BY m.fecha DESC NULLS LAST
LIMIT 40;

SELECT 'cc_int_LEGACY_muestra' AS q, m.id, m.orden_id, m.transaccion_id, left(COALESCE(m.concepto, ''), 100) AS concepto_pref
FROM public.movimientos_cuenta_corriente_intermediario m
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
ORDER BY m.fecha DESC NULLS LAST
LIMIT 40;

SELECT 'caja_LEGACY_muestra' AS q, m.id, m.orden_id, m.transaccion_id, m.tipo_movimiento_id, left(COALESCE(m.concepto, ''), 100) AS concepto_pref
FROM public.movimientos_caja m
WHERE m.clasificacion_movimiento = 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion
ORDER BY m.fecha DESC NULLS LAST
LIMIT 40;
